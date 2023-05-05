import {debounce} from 'throttle-debounce';
import chromeP from 'webext-polyfill-kinda';
import {isBackground} from 'webext-detect-page';
import {serialize, deserialize} from 'dom-form-serializer/dist/dom-form-serializer.mjs';
import LZString from 'lz-string';
import {onContextInvalidated} from 'webext-events';
import {loadFile, saveFile} from './file.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- CJS in ESM imports
const {compressToEncodedURIComponent, decompressFromEncodedURIComponent} = LZString;

function alertAndThrow(message: string): never {
	// eslint-disable-next-line no-alert
	alert(message);
	throw new Error(message);
}

async function shouldRunMigrations(): Promise<boolean> {
	const self = await chromeP.management?.getSelf();

	// Always run migrations during development #25
	if (self?.installType === 'development') {
		return true;
	}

	return new Promise(resolve => {
		// Run migrations when the extension is installed or updated
		chrome.runtime.onInstalled.addListener(() => {
			resolve(true);
		});

		// If `onInstalled` isn't fired, then migrations should not be run
		setTimeout(resolve, 500, false);
	});
}

export type StorageType = 'sync' | 'local';

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
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- Maybe later
export interface Setup<UserOptions extends Options> {
	storageName?: string;
	logging?: boolean;
	defaults?: UserOptions;
	/**
	 * A list of functions to call when the extension is updated.
	 */
	migrations?: Array<Migration<UserOptions>>;
	storageType?: StorageType;
}

/**
A map of options as strings or booleans. The keys will have to match the form fields' `name` attributes.
*/
// eslint-disable-next-line @typescript-eslint/consistent-indexed-object-style, @typescript-eslint/consistent-type-definitions -- Interfaces are extendable
export interface Options {
	[key: string]: string | number | boolean;
}

/*
Handler signature for when an extension updates.
*/
export type Migration<UserOptions extends Options> = (savedOptions: UserOptions, defaults: UserOptions) => Promise<void> | void;

class OptionsSync<UserOptions extends Options> {
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
		},
	};

	storageName: string;
	storageType: StorageType;

	defaults: UserOptions;

	_form: HTMLFormElement | undefined;

	private readonly _migrations: Promise<void>;

	/**
	@constructor Returns an instance linked to the chosen storage.
	@param setup - Configuration for `webext-options-sync`
	*/
	constructor({
		// `as` reason: https://github.com/fregante/webext-options-sync/pull/21#issuecomment-500314074
		defaults = {} as UserOptions,
		storageName = 'options',
		migrations = [],
		logging = true,
		storageType = 'sync',
	}: Setup<UserOptions> = {}) {
		this.storageName = storageName;
		this.defaults = defaults;
		this.storageType = storageType;

		if (!logging) {
			this._log = () => {};
		}

		this._migrations = this._runMigrations(migrations);
	}

	private get storage(): chrome.storage.StorageArea {
		return chromeP.storage[this.storageType];
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
	async getAll(): Promise<UserOptions> {
		await this._migrations;
		return this._getAll();
	}

	/**
	Overrides **all** the options stored with your `options`.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async setAll(newOptions: UserOptions): Promise<void> {
		await this._migrations;
		return this._setAll(newOptions);
	}

	/**
	Merges new options with the existing stored options.

	@param newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	*/
	async set(newOptions: Partial<UserOptions>): Promise<void> {
		return this.setAll({...await this.getAll(), ...newOptions});
	}

	/**
	Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved to storage

	@param selector - The `<form>` that needs to be synchronized or a CSS selector (one element).
	The form fields' `name` attributes will have to match the option names.
	*/
	async syncForm(form: string | HTMLFormElement): Promise<void> {
		this._form = form instanceof HTMLFormElement
			? form
			: document.querySelector<HTMLFormElement>(form)!;

		this._form.addEventListener('input', this._handleFormInput);
		this._form.addEventListener('submit', this._handleFormSubmit);
		chrome.storage.onChanged.addListener(this._handleStorageChangeOnForm);
		this._updateForm(this._form, await this.getAll());

		this._form.querySelector('.js-export')?.addEventListener('click', this.exportToFile);
		this._form.querySelector('.js-import')?.addEventListener('click', this.importFromFile);

		onContextInvalidated.addListener(() => {
			location.reload();
		});
	}

	/**
	Removes any listeners added by `syncForm`
	*/
	async stopSyncForm(): Promise<void> {
		if (this._form) {
			this._form.removeEventListener('input', this._handleFormInput);
			this._form.removeEventListener('submit', this._handleFormSubmit);
			this._form.querySelector('.js-export')?.addEventListener('click', this.exportToFile);
			this._form.querySelector('.js-import')?.addEventListener('click', this.importFromFile);
			chrome.storage.onChanged.removeListener(this._handleStorageChangeOnForm);
			delete this._form;
		}
	}

	private get _jsonIdentityHelper() {
		return '__webextOptionsSync';
	}

	/**
	Opens the browser’s file picker to import options from a previously-saved JSON file
	*/
	importFromFile = async (): Promise<void> => {
		const text = await loadFile();

		let options: UserOptions;

		try {
			options = JSON.parse(text) as UserOptions;
		} catch {
			alertAndThrow('The file is not a valid JSON file.');
		}

		if (!(this._jsonIdentityHelper in options)) {
			alertAndThrow('The file selected is not a valid recognized options file.');
		}

		delete options[this._jsonIdentityHelper];

		await this.set(options);
		if (this._form) {
			this._updateForm(this._form, options);
		}
	};

	/**
	Opens the browser’s "save file" dialog to export options to a JSON file
	*/
	exportToFile = async (): Promise<void> => {
		const extension = chrome.runtime.getManifest();
		const text = JSON.stringify({
			[this._jsonIdentityHelper]: extension.name,
			...await this.getAll(),
		}, null, '\t');

		await saveFile(text, extension.name + ' options.json');
	};

	private _log(method: 'log' | 'info', ...args: any[]): void {
		console[method](...args);
	}

	private async _getAll(): Promise<UserOptions> {
		const result = await this.storage.get(this.storageName);
		return this._decode(result[this.storageName]);
	}

	private async _setAll(newOptions: UserOptions): Promise<void> {
		this._log('log', 'Saving options', newOptions);
		await this.storage.set({
			[this.storageName]: this._encode(newOptions),
		});
	}

	private _encode(options: UserOptions): string {
		const thinnedOptions: Partial<UserOptions> = {...options};
		for (const [key, value] of Object.entries(thinnedOptions)) {
			if (this.defaults[key] === value) {
				delete thinnedOptions[key];
			}
		}

		this._log('log', 'Without the default values', thinnedOptions);

		return compressToEncodedURIComponent(JSON.stringify(thinnedOptions));
	}

	private _decode(options: string | UserOptions): UserOptions {
		let decompressed = options;
		if (typeof options === 'string') {
			decompressed = JSON.parse(decompressFromEncodedURIComponent(options)!) as UserOptions;
		}

		return {...this.defaults, ...decompressed as UserOptions};
	}

	private async _runMigrations(migrations: Array<Migration<UserOptions>>): Promise<void> {
		if (migrations.length === 0 || !isBackground() || !await shouldRunMigrations()) {
			return;
		}

		const options = await this._getAll();
		const initial = JSON.stringify(options);

		this._log('log', 'Found these stored options', {...options});
		this._log('info', 'Will run', migrations.length, migrations.length === 1 ? 'migration' : ' migrations');
		for (const migrate of migrations) {
			// eslint-disable-next-line no-await-in-loop -- Must be done in order
			await migrate(options, this.defaults);
		}

		// Only save to storage if there were any changes
		if (initial !== JSON.stringify(options)) {
			await this._setAll(options);
		}
	}

	// eslint-disable-next-line @typescript-eslint/member-ordering -- Needs to be near _handleFormSubmit
	private readonly _handleFormInput = debounce(300, async ({target}: Event): Promise<void> => {
		const field = target as HTMLInputElement;
		if (!field.name) {
			return;
		}

		await this.set(this._parseForm(field.form!));
		field.form!.dispatchEvent(new CustomEvent('options-sync:form-synced', {
			bubbles: true,
		}));
	});

	private _handleFormSubmit(event: Event): void {
		event.preventDefault();
	}

	private _updateForm(form: HTMLFormElement, options: UserOptions): void {
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
	private _parseForm(form: HTMLFormElement): Partial<UserOptions> {
		const include: string[] = [];

		// Don't serialize disabled and invalid fields
		for (const field of form.querySelectorAll<HTMLInputElement>('[name]')) {
			if (field.validity.valid && !field.disabled) {
				include.push(field.name.replace(/\[.*]/, ''));
			}
		}

		return serialize(form, {include});
	}

	private readonly _handleStorageChangeOnForm = (changes: Record<string, any>, areaName: string): void => {
		if (
			areaName === this.storageType
			&& changes[this.storageName]
			&& (!document.hasFocus() || !this._form!.contains(document.activeElement)) // Avoid applying changes while the user is editing a field
		) {
			this._updateForm(this._form!, this._decode(changes[this.storageName].newValue));
		}
	};
}

export default OptionsSync;
