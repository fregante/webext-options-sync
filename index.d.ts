declare module 'webext-options-sync' {
	export interface DefineOptions {
		defaults: Record<string, string|boolean>;
		migrations: [(options: {disabledFeatures: string}) => void, () => void];
	}

	export default class OptionsSync {
		static migrations: {
			removeUnused: () => void;
		}

		getAll: <T>() => Promise<T>;

		setAll: (newOptions: Record<string, string|boolean>) => Promise<void>;

		set: (newOptions: Record<string, string|boolean>) => Promise<void>;

		syncForm: (selector: string|HTMLFormElement) => void;

		define: (options: DefineOptions) => void;
	}
}
