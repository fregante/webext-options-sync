declare module 'dom-form-serializer/dist/dom-form-serializer.mjs' {
	import {JsonObject} from 'type-fest';

	export function serialize(
		element: HTMLFormElement,
		options: {
			include?: string[];
		}
	): JSONValue;

	export function deserialize(
		element: HTMLFormElement,
		serializedData: JsonObject,
		options?: {
			include?: string[];
		}
	): void;
}
