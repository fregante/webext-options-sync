import {isBackgroundPage} from 'webext-detect-page';

declare namespace OptionsSync {
	interface Settings {
		storageName?: string;
		logging?: boolean;
		defaults: Options;
		/**
		 * A list of functions to call when the extension is updated.
		 */
		migrations: Migration[];
	}

	/**
	A map of options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	type Options = Record<string, string | number | boolean>;

	/*
	Handler signature for when an extension updates.
	*/
	type Migration = (savedOptions: Options, defaults: Options) => void;

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

// eslint-disable-next-line no-redeclare
class OptionsSync {
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

	private _timer?: NodeJS.Timeout;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param options - Configuration to determine where options are stored.
	*/
	constructor(options: Partial<OptionsSync.Settings>) {
		const fullOptions = {
			storageName: 'options',
			defaults: {},
			migrations: [],
			logging: true,
			...options
		};

		this.storageName = fullOptions.storageName;

		if (fullOptions.logging === false) {
			this._log = () => {};
		}

		if (isBackgroundPage()) {
			chrome.runtime.onInstalled.addListener(() => this._applyDefinition(fullOptions));
		}

		this._handleFormUpdatesDebounced = this._handleFormUpdatesDebounced.bind(this);
	}

	_log(method: keyof Console, ...args: any[]): void {
		console[method](...args);
	}

	async _applyDefinition(defs: OptionsSync.Settings): Promise<void> {
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

	_parseNumbers(options: OptionsSync.Options): OptionsSync.Options {
		for (const name of Object.keys(options)) {
			if (options[name] === String(Number(options[name]))) {
				options[name] = Number(options[name]);
			}
		}

		return options;
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
	getAll(): Promise<OptionsSync.Options> {
		return new Promise<OptionsSync.Options>(resolve => {
			chrome.storage.sync.get(this.storageName,
				keys => resolve(keys[this.storageName] || {})
			);
		}).then(this._parseNumbers);
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	setAll(newOptions: OptionsSync.Options): Promise<void> {
		return new Promise(resolve => {
			chrome.storage.sync.set({
				[this.storageName]: newOptions,
			}, resolve);
		});
	}

	/**
	Merges new options with the existing stored options.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async set(newOptions: OptionsSync.Options): Promise<void> {
		const options = await this.getAll();
		this.setAll(Object.assign(options, newOptions));
	}

	/**
	Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved via `chrome.storage.sync`.

	@param selector - The `<form>` that needs to be synchronized or a CSS selector (one element).
	The form fields' `name` attributes will have to match the option names.
	*/
	async syncForm(form: string | HTMLFormElement): Promise<void> {
		if (typeof form === 'string') {
			form = document.querySelector<HTMLFormElement>(form)!;
		}

		form.addEventListener('input', this._handleFormUpdatesDebounced);
		form.addEventListener('change', this._handleFormUpdatesDebounced);
		chrome.storage.onChanged.addListener((changes, namespace) => {
			if (namespace === 'sync') {
				for (const key of Object.keys(changes)) {
					const {newValue} = changes[key];
					if (key === this.storageName) {
						this._applyToForm(newValue, form as HTMLFormElement);
						return;
					}
				}
			}
		});

		this._applyToForm(await this.getAll(), form);
	}

	_applyToForm(options: OptionsSync.Options, form: HTMLFormElement): void {
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

		this._log('groupEnd');
	}

	_handleFormUpdatesDebounced(event: Event): void {
		if (this._timer) {
			clearTimeout(this._timer);
		}

		this._timer = setTimeout(() => {
			this._handleFormUpdates(event.currentTarget as HTMLFormElement);
			this._timer = undefined;
		}, 100);
	}

	_handleFormUpdates(el: HTMLFormElement): void {
		const {name} = el;
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
		this.set({
			[name]: value,
		});
	}
}

if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
	class OptionsSyncElement extends HTMLFormElement {
		constructor() {
			super();
			new OptionsSync({
				storageName: this.getAttribute('storageName') || undefined,
				logging: Boolean(this.getAttribute('logging')) // Boolean attribute, if it's there it's true
			}).syncForm(this);
		}
	}

	customElements.define('options-sync', OptionsSyncElement);
}

export = OptionsSync;
