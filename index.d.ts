declare module 'webext-options-sync' {
	interface DefineOptions {
		defaults: {
			disabledFeatures: string;
			customCSS: string;
			personalToken: string;
			logging: boolean;
		};
		migrations: [(options: {disabledFeatures: string}) => void, () => void];
	}

	export default class OptionsSync {
		static migrations: {
			removeUnused: () => void;
		}

		getAll: <T>() => T;

		setAll: (newOptions: unknown) => Promise<void>;

		set: (newOptions: unknown) => Promise<void>;

		syncForm: (selector: string) => void;

		define: (options: DefineOptions) => void;
	}
}
