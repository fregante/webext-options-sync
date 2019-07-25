import {isBackgroundPage} from 'webext-detect-page';
// @ts-ignore
import {serialize, deserialize} from 'dom-form-serializer';

declare namespace OptionsSync {
	interface Settings<TOptions extends Options> {
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
}

class OptionsSync<TOptions extends OptionsSync.Options> {
	public static migrations = {
		/**
		Helper method that removes any option that isn't defined in the defaults. It's useful to avoid leaving old options taking up space.
		*/
		removeUnused(options: OptionsSync.Options, defaults: OptionsSync.Options) {
			for (const key of Object.keys(options)) {
				if (!(key in defaults)) {
					delete options[key];
				}
			}
		}
	};

	storageName: string;

	defaults: TOptions;

	private _timer?: ReturnType<typeof setTimeout>;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param options - Configuration to determine where options are stored.
	*/
	constructor(options?: OptionsSync.Settings<TOptions>) {
		const fullOptions: Required<OptionsSync.Settings<TOptions>> = {
			// https://github.com/fregante/webext-options-sync/pull/21#issuecomment-500314074
			// eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
			defaults: {} as TOptions,
			storageName: 'options',
			migrations: [],
			logging: true,
			...options
		};

		this.storageName = fullOptions.storageName;
		this.defaults = fullOptions.defaults;

		if (fullOptions.logging === false) {
			this._log = () => {};
		}

		if (isBackgroundPage()) {
			chrome.management.getSelf(({installType}) => {
				// Chrome doesn't run `onInstalled` when launching the browser with a pre-loaded development extension #25
				if (installType === 'development') {
					this._applyDefinition(fullOptions);
				} else {
					chrome.runtime.onInstalled.addListener(() => this._applyDefinition(fullOptions));
				}
			});
		}

		this._handleFormUpdatesDebounced = this._handleFormUpdatesDebounced.bind(this);
	}

	/**
	Retrieves all the options stored.

	@returns Promise that will resolve with **all** the options stored, as an object.

	@example

	new OptionsSync().getAll().then(options => {
		console.log('The user’s options are', options);
		if (options.color) {
			document.body.style.color = color;
		}
	});
	*/
	async getAll(): Promise<TOptions> {
		const keys = await new Promise<Record<string, TOptions>>((resolve, reject) => {
			chrome.storage.sync.get({
				[this.storageName]: this.defaults
			}, result => {
				if (chrome.runtime.lastError) {
					reject(chrome.runtime.lastError);
				} else {
					resolve(result);
				}
			});
		});

		return keys[this.storageName];
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async setAll(newOptions: TOptions): Promise<void> {
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

		element.addEventListener('input', this._handleFormUpdatesDebounced);
		element.addEventListener('change', this._handleFormUpdatesDebounced);
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (
				namespace === 'sync' &&
				changes[this.storageName] &&
				!element.contains(document.activeElement) // Avoid applying changes while the user is editing a field
			) {
				deserialize(element, changes[this.storageName].newValue);
			}
		});

		deserialize(element, await this.getAll());
	}

	private _log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
	}

	private async _applyDefinition(defs: Required<OptionsSync.Settings<TOptions>>): Promise<void> {
		const options = {...defs.defaults, ...await this.getAll()};

		this._log('group', 'Appling definitions');
		this._log('info', 'Current options:', options);
		if (defs.migrations && defs.migrations.length > 0) {
			this._log('info', 'Running', defs.migrations.length, 'migrations');
			defs.migrations.forEach(migrate => migrate(options, defs.defaults));
		}

		this._log('info', 'Migrated options:', options);
		this._log('groupEnd');

		this.setAll(options);
	}

	private _handleFormUpdatesDebounced({currentTarget}: Event): void {
		if (this._timer) {
			clearTimeout(this._timer);
		}

		this._timer = setTimeout(async () => {
			// Parse form into object, except invalid fields
			const options: TOptions = serialize(currentTarget, {
				exclude: [...document.querySelectorAll<HTMLInputElement>('[name]:invalid')].map(field => field.name)
			});

			await this.set(options);
			currentTarget!.dispatchEvent(new CustomEvent('options-sync:form-synced', {
				bubbles: true
			}));
			this._timer = undefined;
		}, 600);
	}
}

export = OptionsSync;
