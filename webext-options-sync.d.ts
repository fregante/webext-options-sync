/**
A map of options as strings or booleans. The keys will have to match the form fields' `name` attributes.
*/
export declare type Options = Record<string, string | number | boolean>;
export declare type Migration = (savedOptions: Options, defaults: Options) => void;
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
export interface Definitions {
	defaults: Options;
	/**
     * A list of functions to call when the extension is updated.
     */
	migrations: Migration[];
}
