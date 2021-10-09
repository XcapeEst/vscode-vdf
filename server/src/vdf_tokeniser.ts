export class VDFTokeniser {
	str: string
	position: number = 0;
	line: number = 0;
	character: number = 0;

	// Parser Constants
	private static readonly whiteSpaceIgnore: string[] = [" ", "\t", "\r", "\n"]

	constructor(str: string) {
		this.str = str
	}

	next(lookAhead: boolean = false): string {
		let currentToken: string = ""
		let j: number = this.position
		let _line: number = this.line
		let _character: number = this.character
		if (j >= this.str.length - 1) {
			return "EOF"
		}
		while ((VDFTokeniser.whiteSpaceIgnore.includes(this.str[j]) || this.str[j] == "/") && j <= this.str.length - 1) {
			if (this.str[j] == '\n') {
				_line++;
				_character = 0;
			}
			else {
				_character++;
			}
			if (this.str[j] == '/') {
				if (this.str[j + 1] == '/') {
					while (this.str[j] != '\n') {
						j++;
						// _character++;
					}
				}
			}
			else {
				j++;
				// _character++
			}
			if (j >= this.str.length) {
				return "EOF";
			}
		}
		if (this.str[j] == '"') {
			// Read until next quote (ignore opening quote)
			j++; // Skip over opening double quote
			_character++; // Skip over opening double quote
			while (this.str[j] != '"' && j < this.str.length) {
				if (this.str[j] == '\n') {
					throw {
						message: `Unexpected EOL at position ${j} (line ${_line + 1}, position ${_character + 1})! Are you missing a closing double quote?`,
						line: _line,
						character: _character
					}
				}
				currentToken += this.str[j];
				j++;
				_character++;
			}
			j++; // Skip over closing quote
			_character++; // Skip over closing quote
		}
		else {
			// Read until whitespace (or end of file)
			while (!VDFTokeniser.whiteSpaceIgnore.includes(this.str[j]) && j < this.str.length - 1) {
				if (this.str[j] == '"') {
					throw {
						message: `Unexpected " at position ${j} (line ${this.line}, position ${this.character})! Are you missing terminating whitespace?`,
						line: _line,
						character: _character
					}
				}
				currentToken += this.str[j];
				j++;
				_character++;
			}
		}
		if (!lookAhead) {
			this.position = j;
			this.line = _line;
			this.character = _character;
		}
		return currentToken
	}
}