import { EndOfStreamError, UnclosedEscapeSequenceError, UnexpectedCharacterError } from "./VDFErrors"
import { VDFPosition } from "./VDFPosition"
import { VDFRange } from "./VDFRange"
import { VDFToken, VDFTokenType } from "./VDFToken"
import type { VDFTokeniserOptions } from "./VDFTokeniserOptions"

export class VDFTokeniser {

	/**
	 * ```ts
	 * readonly [" ", "\t", "\r", "\n"]
	 * ```
	 */
	public static readonly whiteSpaceIgnore = new Set([" ", "\t", "\r", "\n"])

	/**
	 * ```ts
	 * readonly ["\"", "{", "}"]
	 * ```
	 */
	public static readonly whiteSpaceTokenTerminate = new Set(["\"", "{", "}"])

	private readonly str: string

	private readonly options: VDFTokeniserOptions

	/**
	 * Zero-based offset position
	 */
	public index = 0

	/**
	 * Zero-based line number
	 */
	public line = 0

	/**
	 * Zero-based character number in current line
	 */
	public character = 0

	// Peek
	private _peek: { token: VDFToken, index: number, line: number, character: number } | null = null

	// EOF
	private _EOFRead = false

	constructor(str: string, options?: VDFTokeniserOptions) {
		this.str = str
		this.options = {
			allowMultilineStrings: options?.allowMultilineStrings ?? false
		}

		// UTF-16 LE
		if (str.substring(0, 1).charCodeAt(0) == 65279) {
			this.next()
		}
	}

	public next(peek = false): VDFToken | null {

		if (this._peek != null) {
			const token = this._peek.token
			if (!peek) {
				this.index = this._peek.index
				this.line = this._peek.line
				this.character = this._peek.character
				this._peek = null
			}
			return token
		}

		let index = this.index
		let line = this.line
		let character = this.character

		while (index < this.str.length && (VDFTokeniser.whiteSpaceIgnore.has(this.str[index]) || this.str[index] == "/")) {
			if (this.str[index] == "\n") {
				line++
				character = 0
			}
			else if (this.str[index] == "/") {
				index++
				if (index < this.str.length && this.str[index] == "/") {
					while (index < this.str.length && this.str[index] != "\n") {
						index++
					}
					line++
					character = 0
				}
				else {
					break
				}
			}
			else {
				character++
			}
			index++
		}

		if (index >= this.str.length) {
			if (this._EOFRead) {
				const position = new VDFPosition(line, character)
				throw new EndOfStreamError(["token"], new VDFRange(position, position))
			}
			// The VDF Parser will need to read the last token twice, once for checking conditional
			// and then again for checking that the last key is null
			if (!peek) {
				this._EOFRead = true
			}
			return null
		}

		let token: VDFToken

		switch (this.str[index]) {
			case "{":
			case "}": {
				token = {
					type: VDFTokenType.ControlCharacter,
					value: this.str[index],
					range: new VDFRange(
						new VDFPosition(line, character),
						new VDFPosition(line, character + 1),
					)
				}
				index++
				character++
				break
			}
			case "\"": {
				index++
				character++
				const start = index
				const startPosition = new VDFPosition(line, character)
				while (this.str[index] != "\"") {
					if (index >= this.str.length) {
						throw new EndOfStreamError(["'\"'"], new VDFRange(startPosition, new VDFPosition(line, character)))
					}
					if (this.str[index] == "\n") {
						if (this.options.allowMultilineStrings) {
							line++
							character = 0
						}
						else {
							throw new UnexpectedCharacterError("'\\n'", ["'\"'"], new VDFRange(startPosition, new VDFPosition(line, character)))
						}
					}
					else if (this.str[index] == "\\") {
						// Increment character only, index is incremented at the end of the loop because an iteration could be a newline
						character++
						if (index >= this.str.length) {
							throw new UnclosedEscapeSequenceError(new VDFRange(startPosition, new VDFPosition(line, character)))
						}
						index++
						character++
					}
					else {
						character++
					}
					index++
				}
				const end = index
				const endPosition = new VDFPosition(line, character)
				index++
				character++
				token = {
					type: VDFTokenType.String,
					value: this.str.slice(start, end),
					range: new VDFRange(
						startPosition,
						endPosition
					)
				}
				break
			}
			default: {
				const start = index
				const startPosition = new VDFPosition(line, character)
				while (index < this.str.length && !VDFTokeniser.whiteSpaceIgnore.has(this.str[index])) {
					if (VDFTokeniser.whiteSpaceTokenTerminate.has(this.str[index])) {
						break
					}
					index++
					character++
				}
				const end = index
				const endPosition = new VDFPosition(line, character)
				const value = this.str.slice(start, end)
				token = {
					type: value.startsWith("[") && value.endsWith("]") ? VDFTokenType.Conditional : VDFTokenType.String,
					value: value,
					range: new VDFRange(
						startPosition,
						endPosition
					)
				}
				break
			}
		}

		if (peek) {
			this._peek = {
				token,
				index,
				line,
				character
			}
		}
		else {
			this.index = index
			this.line = line
			this.character = character
		}

		return token
	}
}
