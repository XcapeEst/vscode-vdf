import fs from "fs"
import path from "path"
import { fileURLToPath, pathToFileURL, URL } from "url"
import { Definition, DocumentSymbol, Position, Range, SymbolKind } from "vscode-languageserver/node"
import { VDF, VDFOSTags, VDFSyntaxError, VDFTokeniser, VDFTokeniserOptions } from "../../vdf"

/**
 * Recursive merge all properties from one object into another
 * @param obj1 First Object
 * @param obj2 Second Object
 */
export function merge(obj1: any, obj2: any): any {
	for (let i in obj1) {
		if (typeof obj1[i] === "object") {
			if (obj2.hasOwnProperty(i) && typeof obj2[i] == "object") {
				merge(obj1[i], obj2[i])
			}
		}
		else {
			if (obj2.hasOwnProperty(i)) {
				obj1[i] = obj2[i]
			}
		}
	}
	for (let j in obj2) {
		// check if property exists because we dont want to shallow merge an object
		if (!obj1.hasOwnProperty(j)) {
			obj1[j] = obj2[j]
		}
	}
	return obj1
}

/**
 * Resolve root folder of an absolute HUD file path
 * @param uri File uri containing object.
 * @returns The root of the HUD folder as a file path string (`C:/...`)
 */
export function getHUDRoot({ uri }: { uri: string }): string | null {
	let folderPath = fileURLToPath(uri)
	while (folderPath != `${new URL(folderPath).protocol}\\`) {
		if (fs.existsSync(`${folderPath}/info.vdf`)) {
			return folderPath
		}
		folderPath = path.dirname(folderPath)
	}
	return null
}

export function loadControls(filePath: string): any {
	const origin: object = {}
	const addControls = (filePath: string) => {
		const obj = fs.existsSync(filePath) ? VDF.parse(fs.readFileSync(filePath, "utf-8")) : {}
		if (obj.hasOwnProperty("#base")) {
			const baseFiles: string[] = Array.isArray(obj["#base"]) ? obj["#base"] : [obj["#base"]]
			const folder = path.dirname(filePath)
			for (const baseFile of baseFiles) {
				addControls(`${folder}/${baseFile}`)
			}
		}
		merge(origin, obj)
	}
	addControls(filePath)
	return origin
}
export interface VDFDocumentSymbol extends DocumentSymbol {
	key: string
	keyRange: Range
	value?: string
	valueRange?: Range,
	children?: VDFDocumentSymbol[]
}


export function getVDFDocumentSymbols(str: string, options?: VDFTokeniserOptions): VDFDocumentSymbol[] {
	const tokeniser = new VDFTokeniser(str, options)
	const parseObject = (): VDFDocumentSymbol[] => {
		const locations: VDFDocumentSymbol[] = []
		let currentToken = tokeniser.next();
		let currentTokenRange: Range = {
			start: Position.create(tokeniser.line, tokeniser.character - currentToken.length - tokeniser.quoted),
			end: Position.create(tokeniser.line, tokeniser.character - tokeniser.quoted),
		}
		let nextToken = tokeniser.next(true);
		while (currentToken != "}" && nextToken != "EOF") {
			const lookahead: string = tokeniser.next(true)
			if (lookahead.startsWith("[") && lookahead.endsWith("]") && (tokeniser.options.osTags == VDFOSTags.Objects || tokeniser.options.osTags == VDFOSTags.All)) {
				// Object with OS Tag
				const line = tokeniser.line
				const character = tokeniser.character

				currentToken += `${tokeniser.next()}`; // Skip over OS Tag
				tokeniser.next(); // Skip over opening brace

				const range: Range = {
					start: Position.create(line, character),
					end: Position.create(line, character + currentToken.length)
				}

				locations.push({
					name: currentToken,
					kind: 19,
					range: range,
					selectionRange: range,
					children: parseObject(),
					key: currentToken,
					keyRange: range
				})
			}
			else if (nextToken == "{") {
				// Object
				const line = tokeniser.line
				const character = tokeniser.character
				tokeniser.next(); // Skip over opening brace

				const range: Range = {
					start: Position.create(line, character - currentToken.length - tokeniser.quoted - 1),
					end: Position.create(line, character - tokeniser.quoted - 1)
				}

				locations.push({
					name: currentToken,
					kind: SymbolKind.Object,
					range: range,
					selectionRange: range,
					children: parseObject(),
					key: currentToken,
					keyRange: range
				});
			}
			else {
				// Primitive
				tokeniser.next(); // Skip over value

				locations.push({
					name: currentToken,
					detail: nextToken,
					kind: SymbolKind.String,
					range: currentTokenRange,
					selectionRange: currentTokenRange,
					key: currentToken,
					keyRange: currentTokenRange,
					value: nextToken,
					valueRange: {
						start: Position.create(tokeniser.line, tokeniser.character - nextToken.length - tokeniser.quoted),
						end: Position.create(tokeniser.line, tokeniser.character - tokeniser.quoted),
					}
				});


				// Check primitive os tag
				const lookahead: string = tokeniser.next(true)
				if (lookahead.startsWith("[") && lookahead.endsWith("]") && (tokeniser.options.osTags == VDFOSTags.Strings || tokeniser.options.osTags == VDFOSTags.All)) {
					tokeniser.next()
				}

				if (nextToken == "}") {
					throw new VDFSyntaxError(`Missing value for "${currentToken}"`, tokeniser.line, tokeniser.character)
				}
			}
			currentToken = tokeniser.next();
			currentTokenRange = {
				start: Position.create(tokeniser.line, tokeniser.character - currentToken.length - tokeniser.quoted),
				end: Position.create(tokeniser.line, tokeniser.character - tokeniser.quoted),
			}
			nextToken = tokeniser.next(true);
		}
		return locations;
	}
	return parseObject();
}

/**
* Search a HUD file for a specified key/value pair
* @param uri Uri path to file
* @param str fileContents or file DocumentSymbol[]
* @param key key name to search for.
* @param value value to search for (Optional)
* @param parentKeyConstraint
* @returns The file uri (starting with file:///), line and character of the specified key (or null if the key is not found)
*/
export function getLocationOfKey(uri: string, str: string | DocumentSymbol[], key: string, value?: string, parentKeyConstraint?: string): Definition | null {
	const searchFile = (filePath: string, documentSymbols: DocumentSymbol[]) => {
		const objectPath: string[] = []
		const search = (documentSymbols: DocumentSymbol[]): Definition | null => {
			for (const documentSymbol of documentSymbols) {
				objectPath.push(documentSymbol.name.toLowerCase())
				const currentKey: string = documentSymbol.name.toLowerCase()
				if (currentKey == "#base") {
					const baseFilePath = `${path.dirname(filePath)}/${documentSymbol.detail}`
					if (fs.existsSync(baseFilePath)) {
						const result = searchFile(baseFilePath, getVDFDocumentSymbols(fs.readFileSync(baseFilePath, "utf-8")))
						if (result) {
							return result
						}
					}
				}
				if (currentKey == key && (value ? documentSymbol.detail == value : true) && (parentKeyConstraint ? objectPath.includes(parentKeyConstraint.toLowerCase()) : true)) {
					return {
						uri: pathToFileURL(filePath).href,
						range: documentSymbol.range
					}
				}
				if (documentSymbol.children) {
					const result = search(documentSymbol.children)
					if (result) {
						return result
					}
				}
				objectPath.pop()
			}
			return null
		}
		return search(documentSymbols)
	}

	uri = uri.startsWith("file:///") ? fileURLToPath(uri) : uri
	str = typeof str == "string" ? getVDFDocumentSymbols(str) : str
	key = key.toLowerCase()

	return searchFile(uri, str)
}