import {debounce} from 'throttle-debounce';
import {isBackgroundPage} from 'webext-detect-page';
import {serialize, deserialize} from 'dom-form-serializer/lib';
import {compressToEncodedURIComponent as compress, decompressFromEncodedURIComponent as decompress} from 'lz-string';

/**
@example
{
	// Recommended
	defaults: {
		color: 'blue'
	},
	// Optional
	migrations: [
		savedOptions => {
			if (savedOptions.oldStuff) {
				delete savedOptions.oldStuff;
			}
		}
	],
}
*/
interface Setup<TOptions extends Options> {
	storageName?: string;
	logging?: boolean;
	defaults?: TOptions;
	/**
	 * A list of functions to call when the extension is updated.
	 */
	migrations?: Array<Migration<TOptions>>;
}

/**
A map of options as strings or booleans. The keys will have to match the form fields' `name` attributes.
*/
interface Options {
	[key: string]: string | number | boolean;
}

/*
Handler signature for when an extension updates.
*/
export type Migration<TOptions extends Options> = (savedOptions: TOptions, defaults: TOptions) => void;

class OptionsSync<TOptions extends Options> {
	public static migrations = {
		/**
		Helper method that removes any option that isn't defined in the defaults. It's useful to avoid leaving old options taking up space.
		*/
		removeUnused(options: Options, defaults: Options) {
			for (const key of Object.keys(options)) {
				if (!(key in defaults)) {
					delete options[key];
				}
			}
		}
	};

	storageName: string;

	defaults: TOptions;

	private _form!: HTMLFormElement;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param setup - Configuration for `webext-options-sync`
	*/
	constructor({
		// `as` reason: https://github.com/fregante/webext-options-sync/pull/21#issuecomment-500314074
		// eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
		defaults = {} as TOptions,
		storageName = 'options',
		migrations = [],
		logging = true
	}: Setup<TOptions> = {}) {
		this.storageName = storageName;
		this.defaults = defaults;
		this._handleFormInput = debounce(600, this._handleFormInput.bind(this));
		this._handleStorageChangeOnForm = this._handleStorageChangeOnForm.bind(this);

		if (logging === false) {
			this._log = () => {};
		}

		if (isBackgroundPage()) {
			chrome.management.getSelf(({installType}) => {
				// Chrome doesn't run `onInstalled` when launching the browser with a pre-loaded development extension #25
				if (installType === 'development') {
					this._runMigrations(migrations);
				} else {
					chrome.runtime.onInstalled.addListener(() => {
						this._runMigrations(migrations);
					});
				}
			});
		}
	}

	/**
	Retrieves all the options stored.

	@returns Promise that will resolve with **all** the options stored, as an object.

	@example
	const optionsStorage = new OptionsSync();
	const options = await optionsStorage.getAll();
	console.log('The user’s options are', options);
	if (options.color) {
		document.body.style.color = color;
	}
	*/
	async getAll(): Promise<TOptions> {
		return new Promise<TOptions>((resolve, reject) => {
			chrome.storage.sync.get(this.storageName, result => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					const decompressed = this._decompressOptions(result[this.storageName]);
					resolve(this._includeDefaults(decompressed));
				}
			});
		});
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async setAll(newOptions: TOptions): Promise<void> {
		const thinnedOptions = this._excludeDefaults(newOptions);
		this._log('log', 'Saving options', newOptions);
		this._log('log', 'Without the default values', thinnedOptions);

		const data = {[this.storageName]: this._compressOptions(thinnedOptions)};

		return new Promise((resolve, reject) => {
			chrome.storage.sync.set(data, () => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve();
				}
			});
		});
	}

	/**
	Merges new options with the existing stored options.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async set(newOptions: Partial<TOptions>): Promise<void> {
		return this.setAll({...await this.getAll(), ...newOptions});
	}

	/**
	Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved via `chrome.storage.sync`.

	@param selector - The `<form>` that needs to be synchronized or a CSS selector (one element).
	The form fields' `name` attributes will have to match the option names.
	*/
	async syncForm(form: string | HTMLFormElement): Promise<void> {
		this._form = form instanceof HTMLFormElement ?
			form :
			document.querySelector<HTMLFormElement>(form)!;

		this._form.addEventListener('input', this._handleFormInput);
		chrome.storage.onChanged.addListener(this._handleStorageChangeOnForm);
		this._updateForm(this._form, await this.getAll());
	}

	/**
	Removes any listeners added by `syncForm`
	*/
	async stopSyncForm(): Promise<void> {
		if (this._form) {
			this._form.removeEventListener('input', this._handleFormInput);
			chrome.storage.onChanged.removeListener(this._handleStorageChangeOnForm);
			delete this._form;
		}
	}

	private _log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
	}

	private _includeDefaults(options: Partial<TOptions>): TOptions {
		return {...this.defaults, ...options};
	}

	private _excludeDefaults(options: TOptions): Partial<TOptions> {
		const thinnedOptions: Partial<TOptions> = {...options};
		for (const [key, value] of Object.entries(thinnedOptions)) {
			if (this.defaults[key] === value) {
				delete thinnedOptions[key];
			}
		}

		return thinnedOptions;
	}

	private async _runMigrations(migrations: Array<Migration<TOptions>>): Promise<void> {
		const options = await this.getAll();

		if (migrations && migrations.length > 0) {
			this._log('log', 'Found these stored options', {...options});
			this._log('info', 'Will run', migrations.length, migrations.length === 1 ? 'migration' : ' migrations');
			migrations.forEach(migrate => migrate(options, this.defaults));
		}

		this.setAll(options);
	}

	private async _handleFormInput({target}: Event): Promise<void> {
		const form = (target as HTMLInputElement).form!;
		try {
			await this.set(this._parseForm(form));
			form.dispatchEvent(new CustomEvent('options-sync:form-synced', {
				bubbles: true
			}));
		} catch (error) {
			// If used in an event handler the error is suppressed
			this._log('error', error.message || error);
		}
	}

	private _updateForm(form: HTMLFormElement, options: TOptions): void {
		// Reduce changes to only values that have changed
		const currentFormState = this._parseForm(form);
		for (const [key, value] of Object.entries(options)) {
			if (currentFormState[key] === value) {
				delete options[key];
			}
		}

		const include = Object.keys(options);
		if (include.length > 0) {
			// Limits `deserialize` to only the specified fields. Without it, it will try to set the every field, even if they're missing from the supplied `options`
			deserialize(form, options, {include});
		}
	}

	// Parse form into object, except invalid fields
	private _parseForm(form: HTMLFormElement): Partial<TOptions> {
		const include: string[] = [];

		// Don't serialize disabled and invalid fields
		for (const field of form.querySelectorAll<HTMLInputElement>('[name]')) {
			if (field.validity.valid && !field.disabled) {
				include.push(field.name.replace(/\[.*\]/, ''));
			}
		}

		return serialize(form, {include});
	}

	private _handleStorageChangeOnForm(changes: Record<string, any>, areaName: string): void {
		if (
			areaName === 'sync' &&
			changes[this.storageName] &&
			(!document.hasFocus() || !this._form.contains(document.activeElement)) // Avoid applying changes while the user is editing a field
		) {
			const decompressed = this._decompressOptions(changes[this.storageName].newValue);
			this._updateForm(this._form, this._includeDefaults(decompressed));
		}
	}

	private _compressOptions(options: Partial<TOptions>): string {
		return compress(JSON.stringify(options));
	}

	private _decompressOptions(options: string|TOptions): TOptions {
		if (typeof options !== 'string') {
			return options;
		}

		return JSON.parse(decompress(options));
	}
}

export default OptionsSync;
