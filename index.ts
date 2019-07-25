import {RequireAtLeastOne} from 'type-fest';
import {isBackgroundPage} from 'webext-detect-page';

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

	private _timer?: ReturnType<typeof setTimeout>;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param options - Configuration to determine where options are stored.
	*/
	constructor(options?: Settings<TOptions>) {
		const fullOptions: Required<Settings<TOptions>> = {
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

		return this._parseNumbers(keys[this.storageName]);
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
	async set(newOptions: RequireAtLeastOne<TOptions>): Promise<void> {
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
				this._applyToForm(changes[this.storageName].newValue, element);
			}
		});

		this._applyToForm(await this.getAll(), element);
	}

	private _applyToForm(options: TOptions, form: HTMLFormElement): void {
		this._log('group', 'Updating form');
		for (const name of Object.keys(options)) {
			const els = form.querySelectorAll<HTMLInputElement>(`[name="${CSS.escape(name)}"]`);
			const [field] = els;
			if (field) {
				this._log('info', name, ':', options[name]);
				switch (field.type) {
					case 'checkbox':
						field.checked = options[name] as boolean;
						break;
					case 'radio': {
						const [selected] = [...els].filter(el => el.value === options[name]);
						if (selected) {
							selected.checked = true;
						}

						break;
					}

					default:
						field.value = options[name] as string;
						break;
				}

				field.dispatchEvent(new InputEvent('input'));
			} else {
				this._log('warn', 'Stored option {', name, ':', options[name], '} was not found on the page');
			}
		}

		form.dispatchEvent(new CustomEvent('options-sync:form-synced', {
			bubbles: true
		}));
		this._log('groupEnd');
	}

	private _handleFormUpdatesDebounced({target}: Event): void {
		if (this._timer) {
			clearTimeout(this._timer);
		}

		this._timer = setTimeout(() => {
			this._handleFormUpdates(target as HTMLFormElement);
			this._timer = undefined;
		}, 600);
	}

	private _handleFormUpdates(el: HTMLFormElement): void {
		const {name}: {name: keyof TOptions} = el;
		let {value} = el;
		if (!name || !el.validity.valid) {
			return;
		}

		switch (el.type) {
			case 'select-one':
				value = el.options[el.selectedIndex].value;
				break;
			case 'checkbox':
				value = el.checked;
				break;
			default: break;
		}

		this._log('info', 'Saving option', el.name, 'to', value);
		// @ts-ignore `name` should be a keyof TOptions but it's a plain string, so it fails
		this.set({
			[name]: value
		});
	}

	private _log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
	}

	private async _applyDefinition(defs: Required<Settings<TOptions>>): Promise<void> {
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

	private _parseNumbers(options: TOptions): TOptions {
		for (const name of Object.keys(options)) {
			if (options[name] === String(Number(options[name]))) {
				// @ts-ignore it will be dropped in #13
				options[name] = Number(options[name]);
			}
		}

		return options;
	}
}

export default OptionsSync;
