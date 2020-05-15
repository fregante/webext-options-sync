import {debounce} from 'throttle-debounce';
import serialize from 'dom-form-serializer/lib/serialize';
import deserialize from 'dom-form-serializer/lib/deserialize';
import {isBackgroundPage} from 'webext-detect-page';
import {compressToEncodedURIComponent, decompressFromEncodedURIComponent} from './vendor/lz-string';

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
export interface Setup<TOptions extends Options> {
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
export interface Options {
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

	_form!: HTMLFormElement;

	private readonly _migrations: Promise<void>;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param setup - Configuration for `webext-options-sync`
	*/
	constructor({
		// `as` reason: https://github.com/fregante/webext-options-sync/pull/21#issuecomment-500314074
		defaults = {} as TOptions,
		storageName = 'options',
		migrations = [],
		logging = true
	}: Setup<TOptions> = {}) {
		this.storageName = storageName;
		this.defaults = defaults;
		this._handleFormInput = debounce(300, this._handleFormInput.bind(this));
		this._handleStorageChangeOnForm = this._handleStorageChangeOnForm.bind(this);

		if (!logging) {
			this._log = () => {};
		}

		this._migrations = this._runMigrations(migrations);
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
		await this._migrations;
		return this._getAll();
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async setAll(newOptions: TOptions): Promise<void> {
		await this._migrations;
		return this._setAll(newOptions);
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
		this._form.addEventListener('submit', this._handleFormSubmit);
		chrome.storage.onChanged.addListener(this._handleStorageChangeOnForm);
		this._updateForm(this._form, await this.getAll());
	}

	/**
	Removes any listeners added by `syncForm`
	*/
	async stopSyncForm(): Promise<void> {
		if (this._form) {
			this._form.removeEventListener('input', this._handleFormInput);
			this._form.removeEventListener('submit', this._handleFormSubmit);
			chrome.storage.onChanged.removeListener(this._handleStorageChangeOnForm);
			delete this._form;
		}
	}

	private _log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
	}

	private async _getAll(): Promise<TOptions> {
		return new Promise<TOptions>((resolve, reject) => {
			chrome.storage.sync.get(this.storageName, result => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(this._decode(result[this.storageName]));
				}
			});
		});
	}

	private async _setAll(newOptions: TOptions): Promise<void> {
		this._log('log', 'Saving options', newOptions);
		return new Promise((resolve, reject) => {
			chrome.storage.sync.set({
				[this.storageName]: this._encode(newOptions)
			}, () => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve();
				}
			});
		});
	}

	private _encode(options: TOptions): string {
		const thinnedOptions: Partial<TOptions> = {...options};
		for (const [key, value] of Object.entries(thinnedOptions)) {
			if (this.defaults[key] === value) {
				delete thinnedOptions[key];
			}
		}

		this._log('log', 'Without the default values', thinnedOptions);

		return compressToEncodedURIComponent(JSON.stringify(thinnedOptions));
	}

	private _decode(options: string|TOptions): TOptions {
		let decompressed = options;
		if (typeof options === 'string') {
			decompressed = JSON.parse(decompressFromEncodedURIComponent(options));
		}

		return {...this.defaults, ...decompressed as TOptions};
	}

	private async _runMigrations(migrations: Array<Migration<TOptions>>): Promise<void> {
		if (migrations.length === 0 || !isBackgroundPage()) {
			return;
		}

		const {installType} = await new Promise(resolve => chrome.management.getSelf(resolve));
		// Chrome doesn't run `onInstalled` when launching the browser with a pre-loaded development extension #25
		if (installType !== 'development') {
			// Migrations should only run onInstalled, but if that event never happens this promise still needs to proceed
			const timeout = await Promise.race([
				new Promise(resolve => chrome.runtime.onInstalled.addListener(resolve)),
				new Promise(resolve => setTimeout(resolve, 500, true))
			]);

			if (timeout === true) {
				return;
			}
		}

		const options = await this._getAll();
		const initial = JSON.stringify(options);

		this._log('log', 'Found these stored options', {...options});
		this._log('info', 'Will run', migrations.length, migrations.length === 1 ? 'migration' : ' migrations');
		migrations.forEach(migrate => migrate(options, this.defaults));

		// Only save to storage if there were any changes
		if (initial !== JSON.stringify(options)) {
			await this._setAll(options);
		}
	}

	private async _handleFormInput({target}: Event): Promise<void> {
		const field = target as HTMLInputElement;
		if (!field.name) {
			return;
		}

		await this.set(this._parseForm(field.form!));
		field.form!.dispatchEvent(new CustomEvent('options-sync:form-synced', {
			bubbles: true
		}));
	}

	private _handleFormSubmit(event: Event): void {
		event.preventDefault();
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
				include.push(field.name.replace(/\[.*]/, ''));
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
			this._updateForm(this._form, this._decode(changes[this.storageName].newValue));
		}
	}
}

export default OptionsSync;
