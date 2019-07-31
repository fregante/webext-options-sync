import {debounce} from 'throttle-debounce';
import {isBackgroundPage} from 'webext-detect-page';
import {serialize, deserialize} from 'dom-form-serializer';

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
type Migration<TOptions extends Options> = (savedOptions: TOptions, defaults: TOptions) => void;

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
		const keys = await new Promise<Record<string, TOptions>>((resolve, reject) => {
			chrome.storage.sync.get(this.storageName, result => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(result);
				}
			});
		});

		return {...this.defaults, ...keys[this.storageName]};
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async setAll(newOptions: TOptions): Promise<void> {
		this._log('log', 'Saving options', {...newOptions});

		// Don't store defaults, they'll be merged at runtime
		for (const [key, value] of Object.entries(newOptions)) {
			if (this.defaults[key] === value) {
				delete newOptions[key];
			}
		}

		this._log('log', 'Without the default values', newOptions);

		return new Promise((resolve, reject) => {
			chrome.storage.sync.set({
				[this.storageName]: newOptions
			}, () => {
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
		const element = form instanceof HTMLFormElement ?
			form :
			document.querySelector<HTMLFormElement>(form)!;

		element.addEventListener('input', this._handleFormInput);
		chrome.storage.onChanged.addListener(this._handleStorageChangeOnForm.bind(this, element));

		deserialize(element, await this.getAll());
	}

	/**
	Removes any listeners added by `syncForm`

	@param selector - The `<form>` that needs to be unsynchronized or a CSS selector (one element).
	The form fields' `name` attributes will have to match the option names.
	*/
	async stopSyncForm(form: string | HTMLFormElement): Promise<void> {
		const element = form instanceof HTMLFormElement ?
			form :
			document.querySelector<HTMLFormElement>(form)!;

		element.removeEventListener('input', this._handleFormInput);
		chrome.storage.onChanged.removeListener(this._handleStorageChangeOnForm.bind(this, element));
	}

	private _log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
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

		// Parse form into object, except invalid fields
		const invalidFields = document.querySelectorAll<HTMLInputElement>('[name]:invalid');
		const options: TOptions = serialize(form, {
			exclude: [...invalidFields].map(field => field.name)
		});

		await this.set(options);
		form.dispatchEvent(new CustomEvent('options-sync:form-synced', {
			bubbles: true
		}));
	}

	private _handleStorageChangeOnForm(form: HTMLFormElement, changes: Record<string, any>, areaName: string): void {
		if (
			areaName === 'sync' &&
			changes[this.storageName] &&
			!form.contains(document.activeElement) // Avoid applying changes while the user is editing a field
		) {
			deserialize(form, changes[this.storageName].newValue);
		}
	}
}

export default OptionsSync;
