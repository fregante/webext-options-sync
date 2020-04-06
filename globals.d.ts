declare module 'dom-form-serializer/lib/serialize' {
	import {JsonObject} from 'type-fest';

	export default function serialize(
		element: HTMLFormElement,
		options: {
			include?: string[];
		}
	): JSONValue;
}

declare module 'dom-form-serializer/lib/deserialize' {
	import {JsonObject} from 'type-fest';

	export default function deserialize(
		element: HTMLFormElement,
		serializedData: JsonObject,
		options?: {
			include?: string[];
		}
	): void;
}
