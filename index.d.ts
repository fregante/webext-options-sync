/**
 * Handler signature for when an extension updates.
 */
export interface ExtensionUpdateHandler {
	(savedOptions: Record<string, string | boolean>, defaults: Record<string, string | boolean>): void;
}

/**
 * @example
 *
 * {
 * 	// Recommended
 * 	defaults: {
 * 		color: 'blue'
 *	},
 * 	// Optional
 * 	migrations: [
 * 		savedOptions => {
 * 			if (savedOptions.oldStuff) {
 * 				delete savedOptions.oldStuff;
 * 			}
 * 		}
 * 	],
 * }
 */
export interface DefineOptions {
	defaults: Record<string, string | boolean>;
	/**
	 * A list of functions to call when the extension is updated.
	 */
	migrations: ExtensionUpdateHandler[];
}

export default class OptionsSync {
	/**
	 * @constructor Returns an instance linked to the chosen storage.
	 *
	 * @param [config={storageName='options'}] - Configuration to determine where options are stored.
	 */
	constructor(config?: {storageName: string});

	static migrations: {
		/**
		 * Helper method that removes any option that isn't defined in the defaults. It's useful to avoid leaving old options taking up space.
		 */
		removeUnused: () => void;
	}

	/**
	 * Retrieves all the options stored.
	 *
	 * @returns Promise that will resolve with **all** the options stored, as an object.
	 *
	 * @example
	 *
	 * new OptionsSync().getAll().then(options => {
	 * 	console.log('The user’s options are', options);
	 * 	if (options.color) {
	 * 		document.body.style.color = color;
	 * 	}
	 * });
	 */
	getAll: <T>() => Promise<T>;

	/**
	 * Overrides **all** the options stored with your `options`.
	 *
	 * @param {Record<string, string | boolean>} newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	 */
	setAll: (newOptions: Record<string, string | boolean>) => Promise<void>;

	/**
	 * Merges new options with the existing stored options.
	 *
	 * @param {Record<string, string | boolean>} newOptions - A map of default options as strings or booleans. The keys will have to match the form fields' `name` attributes.
	 */
	set: (newOptions: Record<string, string | boolean>) => Promise<void>;

	/**
	 * Any defaults or saved options will be loaded into the `<form>` and any change will automatically be saved via `chrome.storage.sync`.
	 *
	 * @param {string | HTMLFormElement} selector - The `<form>` that needs to be synchronized or a CSS selector (one element).
	 * The form fields' `name` attributes will have to match the option names.
	 */
	syncForm: (selector: string | HTMLFormElement) => void;

	/**
	 * To be used in the background only. This is used to initiate the options. It's not required but it's recommended as a way to define which options the extension supports.
	 *
	 * @example
	 *
	 * new OptionsSync().define({
	 * 	defaults: {
	 * 		yourStringOption: 'green',
	 *		anyBooleans: true,
	 *		numbersAreFine: 9001
	 *	 }
	 * });
	*/
	define: (options: DefineOptions) => void;
}
