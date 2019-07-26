declare module 'dom-form-serializer' {

	export function serialize (
		element: HTMLFormElement,
		options: {
			exclude?: string[];
		}
	): JSONValue;

	export function deserialize (
		element: HTMLFormElement,
		serializedData: JSONValue
	): void;
}
