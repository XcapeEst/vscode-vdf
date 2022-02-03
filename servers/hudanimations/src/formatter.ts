import { _Connection } from "vscode-languageserver"
import { animationisType, Command, CommandTypes, HUDAnimation, HUDAnimations, HUDAnimationsStringifyOptions, HUDAnimationsSyntaxError, Interpolator, sanitizeBit, sanitizeNaN } from "../../../shared/hudanimations"
import { VDFFormatTokeniser } from "../../../shared/vdf/dist/VDFFormatTokeniser"
import { parserTools } from "../../../shared/VDF/dist/VDFParserTools"

export interface HUDAnimationsFormatDocumentSymbol {
	comment?: string
	event?: IEvent
}


type AnimationWithComment = AddComment<HUDAnimations.Animate> | AddComment<HUDAnimations.RunEvent> | AddComment<HUDAnimations.StopEvent> | AddComment<HUDAnimations.SetVisible> | AddComment<HUDAnimations.FireCommand> | AddComment<HUDAnimations.RunEventChild> | AddComment<HUDAnimations.SetInputEnabled> | AddComment<HUDAnimations.PlaySound> | AddComment<HUDAnimations.StopPanelAnimations>

interface IEvent {
	name?: string
	comment?: string
	animations: ({ comment: string } | AnimationWithComment)[]
}

type AddComment<T> = T & { comment?: string }


export function getHUDAnimationsFormatDocumentSymbols(str: string, connection: _Connection): HUDAnimationsFormatDocumentSymbol[] {

	const documentSymbols: HUDAnimationsFormatDocumentSymbol[] = []
	const tokeniser = new VDFFormatTokeniser(str)

	// Tools
	const readOSTagAndComment = (animation: { osTag?: string, comment?: string }): void => {
		let osTagorcomment = tokeniser.read({ lookAhead: true, skipNewlines: false })

		if (parserTools.is.comment(osTagorcomment)) {
			animation.comment = osTagorcomment
			tokeniser.read({ skipNewlines: false })	// Skip comment
		}
		else {
			osTagorcomment = tokeniser.read({ lookAhead: true, skipNewlines: true })
			if (parserTools.is.osTag(osTagorcomment)) {
				animation.osTag = osTagorcomment
				tokeniser.read({ skipNewlines: true })	// Skip OS Tag
				osTagorcomment = tokeniser.read({ lookAhead: true, skipNewlines: false })
				if (parserTools.is.comment(osTagorcomment)) {
					animation.comment = parserTools.convert.comment(osTagorcomment)
					tokeniser.read({ skipNewlines: false })
				}
			}
		}
	}

	// Get the next real token
	let currentToken = tokeniser.read({ skipNewlines: true })

	while (currentToken != "EOF") {

		const documentSymbol: HUDAnimationsFormatDocumentSymbol = {}

		if (parserTools.is.comment(currentToken)) {
			// Comment
			documentSymbol.comment = parserTools.convert.comment(currentToken)
		}
		else if (currentToken.toLowerCase() == "event") {
			let eventName = tokeniser.read()

			if (eventName == "{") {
				throw new HUDAnimationsSyntaxError("{", tokeniser, "Expected event name!")
			}

			documentSymbol.event = {
				name: eventName,
				animations: []
			}

			let openingBraceorComment = tokeniser.read({ skipNewlines: true })

			if (parserTools.is.comment(openingBraceorComment)) {
				documentSymbol.event.comment = parserTools.convert.comment(openingBraceorComment)
				openingBraceorComment = tokeniser.read({ skipNewlines: true })
			}

			if (openingBraceorComment != "{") {
				throw new HUDAnimationsSyntaxError(openingBraceorComment, tokeniser, "{")
			}

			let animationType = tokeniser.read({ skipNewlines: true })

			// Read animation statements
			while (animationType != "}") {
				if (parserTools.is.comment(animationType)) {
					documentSymbol.event.animations.push({ comment: parserTools.convert.comment(animationType) })
				}
				else {
					// Animation
					switch (<Lowercase<Command>>animationType.toLowerCase()) {
						case "animate": {
							const animation: AddComment<HUDAnimations.Animate> = {
								type: "Animate",
								element: tokeniser.read({ skipNewlines: true }),
								property: tokeniser.read({ skipNewlines: true }),
								value: tokeniser.read({ skipNewlines: true }),
								interpolator: <Interpolator>tokeniser.read({ skipNewlines: true }),

								// Surpress compiler error
								delay: 0,
								duration: 0
							}

							const interpolator = animation.interpolator!.toLowerCase()

							if (interpolator == "pulse") {
								animation.frequency = <any>tokeniser.read({ skipNewlines: true })
							}
							else if (["gain", "bias"].includes(interpolator)) {
								animation.bias = sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}

							animation.delay = sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							animation.duration = sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)

							readOSTagAndComment(animation)
							documentSymbol.event.animations.push(animation)
							break;
						}
						case "runevent": {
							const runEvent: AddComment<HUDAnimations.RunEvent> = {
								type: "RunEvent",
								event: tokeniser.read({ skipNewlines: true }),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}
							readOSTagAndComment(runEvent)
							documentSymbol.event.animations.push(runEvent)
							break;
						}
						case "stopevent": {
							const stopEvent: AddComment<HUDAnimations.StopEvent> = {
								type: "StopEvent",
								event: tokeniser.read({ skipNewlines: true }),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}
							readOSTagAndComment(stopEvent)
							documentSymbol.event.animations.push(stopEvent)
							break;
						}
						case "setvisible": {
							const setVisible: AddComment<HUDAnimations.SetVisible> = {
								type: "SetVisible",
								element: tokeniser.read({ skipNewlines: true }),
								visible: sanitizeBit(tokeniser.read({ skipNewlines: true }), tokeniser),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser),
							}
							readOSTagAndComment(setVisible)
							documentSymbol.event.animations.push(setVisible)
							break;
						}
						case "firecommand": {
							const fireCommand: AddComment<HUDAnimations.FireCommand> = {
								type: "FireCommand",
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser),
								command: tokeniser.read({ skipNewlines: true }),
							}
							readOSTagAndComment(fireCommand)
							documentSymbol.event.animations.push(fireCommand)
							break;
						}
						case "runeventchild": {
							const runEventChild: AddComment<HUDAnimations.RunEventChild> = {
								type: "RunEventChild",
								element: tokeniser.read({ skipNewlines: true }),
								event: tokeniser.read({ skipNewlines: true }),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}
							readOSTagAndComment(runEventChild)
							documentSymbol.event.animations.push(runEventChild)
							break;
						}
						case "setinputenabled": {
							const setInputEnabled: AddComment<HUDAnimations.SetInputEnabled> = {
								type: "SetInputEnabled",
								element: tokeniser.read({ skipNewlines: true }),
								visible: <any>tokeniser.read({ skipNewlines: true }),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}
							readOSTagAndComment(setInputEnabled)
							documentSymbol.event.animations.push(setInputEnabled)
							break;
						}
						case "playsound": {
							const playSound: AddComment<HUDAnimations.PlaySound> = {
								type: "PlaySound",
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser),
								sound: tokeniser.read({ skipNewlines: true }),
							}
							readOSTagAndComment(playSound)
							documentSymbol.event.animations.push(playSound)
							break;
						}
						case "stoppanelanimations": {
							const stopPanelAnimations: AddComment<HUDAnimations.StopPanelAnimations> = {
								type: "StopPanelAnimations",
								element: tokeniser.read({ skipNewlines: true }),
								delay: sanitizeNaN(tokeniser.read({ skipNewlines: true }), tokeniser)
							}
							readOSTagAndComment(stopPanelAnimations)
							documentSymbol.event.animations.push(stopPanelAnimations)
							break;
						}
						default:
							throw new Error(`Unexpected ${animationType}!`)
					}
				}

				animationType = tokeniser.read({ skipNewlines: true })
			}
		}
		else {
			throw new HUDAnimationsSyntaxError(currentToken, tokeniser)
		}

		documentSymbols.push(documentSymbol)

		currentToken = tokeniser.read({ skipNewlines: true })
	}

	return documentSymbols
}

export function printHUDAnimationsFormatDocumentSymbols(documentSymbols: HUDAnimationsFormatDocumentSymbol[], connection: _Connection, options?: Partial<HUDAnimationsStringifyOptions>): string {

	const _options: HUDAnimationsStringifyOptions = {
		extraTabs: options?.extraTabs ?? 1,
		layoutScope: options?.layoutScope ?? "event",
	}

	connection.console.log(JSON.stringify(_options, null, "\t"))

	// { [key in Command]: readonly (keyof CommandTypes[key])[] }
	const keyOrders = {
		"Animate": <const>["type", "element", "property", "value", "interpolator", "delay", "duration", "osTag"],
		"RunEvent": <const>["type", "event", "delay", "osTag"],
		"StopEvent": <const>["type", "event", "delay", "osTag"],
		"SetVisible": <const>["type", "element", "visible", "delay", "osTag"],
		"FireCommand": <const>["type", "delay", "command", "osTag"],
		"RunEventChild": <const>["type", "element", "event", "delay", "osTag"],
		"SetInputEnabled": <const>["type", "element", "visible", "delay", "osTag"],
		"PlaySound": <const>["type", "delay", "sound", "osTag"],
		"StopPanelAnimations": <const>["type", "element", "delay", "osTag"],
	}

	const keyOrder_AnimateGainBias = <const>["type", "element", "property", "value", "interpolator", "bias", "delay", "duration", "osTag"]
	const keyOrder_AnimatePulse = <const>["type", "element", "property", "value", "interpolator", "frequency", "delay", "duration", "osTag"]

	const getKeyOrders = <T extends Command>(animation: CommandTypes[T]) => {
		if (animationisType(animation, "Animate")) {
			if (animation.interpolator == "Gain" || animation.interpolator == "Bias") {
				return keyOrder_AnimateGainBias
			}
			else if (animation.interpolator == "Pulse") {
				return keyOrder_AnimatePulse
			}
			return keyOrders["Animate"]
		}
		else {
			return keyOrders[animation.type]
		}
	}

	// Because comments end an animation, dont bother updating i
	const writeOSTagAndOrComment = (animation: AddComment<HUDAnimation<Command>>, keyLengths: number[], i: number, lastToken: string): void => {
		if (animation.osTag != undefined) {
			str += `${" ".repeat(keyLengths[i++] - lastToken.length + extraSpaces)}${animation.osTag}`
		}
		if (animation.comment != undefined) {
			// If the animation has an OS Tag, read the length of the OS tag, otherwise read the duration
			str += `${" ".repeat(keyLengths[i++] - (animation.osTag ?? lastToken).length + extraSpaces)}${writeComment(animation.comment)}`
		}
	}

	const writeComment = (comment: string): string => {
		// Comment double slashes are removed by the parser and trimmed
		// If the comment (after trimmed) starts with a '//' it might be a row of '/'s so dont add double slash at the beginning
		return `${(comment[0] == "/" && comment[1] == "/") ? "" : "//"}${commentAfter}${comment}`
		// Dont add newline to comment because if one animation has a comment and one
		//  doesnt there will be two newlines on the animation with comment
	}

	const newLine = "\r\n"

	const commentAfter = " "
	const extraSpaces = _options.extraTabs * 4

	let fileScopeLengths: number[] | null = null

	if (_options.layoutScope == "file") {

		// Filling with -4 to ensure RangeError if the wrong token lengths are passed
		fileScopeLengths = new Array(10).fill(-4)
		for (const documentSymbol of documentSymbols) {
			if (documentSymbol.event?.animations) {
				for (const animation of documentSymbol.event?.animations) {
					// Skip over comments

					if (((a): a is AnimationWithComment => a.hasOwnProperty("type"))(animation)) {
						// Get the order of keys depending on the animation type and interpolator

						const keys = getKeyOrders(animation)

						for (let i: number = 0; i < keys.length; i++) {
							// @ts-ignore
							let value = animation[keys[i]]

							// Check value now that comments can be formatted after OS Tag and not every animation has an OS Tag
							if (value != undefined) {
								fileScopeLengths[i] = Math.max(fileScopeLengths[i], /\s/.test(value) ? (value.toString().length + 2) : value.toString().length)
							}
						}
					}
				}
			}
		}
	}

	let str = ""
	for (const documentSymbol of documentSymbols) {
		if (documentSymbol.comment != undefined) {
			str += `${writeComment(documentSymbol.comment)}${newLine}`
		}
		else if (documentSymbol.event) {
			str += `event ${documentSymbol.event.name}`
			if (documentSymbol.event.comment != undefined) {
				str += `    ${writeComment(documentSymbol.event.comment)}`
			}
			str += `${newLine}{${newLine}`

			// Local key lengths for this event
			let keyLengths = fileScopeLengths

			if (keyLengths == null) {
				keyLengths = new Array(10).fill(-4)
				for (const animation of documentSymbol.event.animations) {
					if (((a): a is AnimationWithComment => a.hasOwnProperty("type"))(animation)) {
						const keys = getKeyOrders(animation)

						for (let i: number = 0; i < keys.length; i++) {
							// Type checking the animation type is useless here because getkeyorders will
							// return the correct keys for the current animation type

							// @ts-ignore
							let value = animation[keys[i]]

							// Check value not falsy
							if (value != undefined) {
								// If a token contains whitespace add 2 quotes to the length
								keyLengths[i] = Math.max(keyLengths[i], /\s/.test(value) ? (value.toString().length + 2) : value.toString().length)
							}
						}
					}
				}
			}

			for (const animation of documentSymbol.event.animations) {
				if (((a): a is AnimationWithComment => a.hasOwnProperty("type"))(animation)) {
					let i: number = 0
					switch (animation.type) {
						case "Animate": {
							str += `    Animate${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.element}${" ".repeat(keyLengths[i++] - animation.element.length + extraSpaces)}`
							str += `${animation.property}${" ".repeat(keyLengths[i++] - animation.property.length + extraSpaces)}`
							str += `${/\s/.test(animation.value) ? `"${animation.value}"` : animation.value}${" ".repeat(keyLengths[i++] - (/\s/.test(animation.value) ? animation.value.length + 2 : animation.value.length) + extraSpaces)}`
							if (animation.interpolator == "Gain" || animation.interpolator == "Bias") {
								str += `${animation.interpolator}${" ".repeat(keyLengths[i++] - animation.interpolator.length + extraSpaces)}`
								str += `${animation.bias}${" ".repeat(keyLengths[i++] - animation.bias!.toString().length + extraSpaces)}`
								str += `${animation.delay}${" ".repeat(keyLengths[i++] - animation.delay.toString().length + extraSpaces)}`
							}
							else if (animation.interpolator == "Pulse") {
								str += `${animation.interpolator}${" ".repeat(keyLengths[i++] - animation.interpolator.length + extraSpaces)}`
								str += `${animation.frequency}${" ".repeat(keyLengths[i++] - animation.frequency!.toString().length + extraSpaces)}`
								str += `${animation.delay}${" ".repeat(keyLengths[i++] - animation.delay.toString().length + extraSpaces)}`
							}
							else {
								str += `${animation.interpolator}${" ".repeat(keyLengths[i++] - animation.interpolator.length + extraSpaces)}`
								str += `${animation.delay}${" ".repeat(keyLengths[i++] - animation.delay.toString().length + extraSpaces)}`
							}
							str += `${animation.duration}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.duration.toString())
							str += `${newLine}`
							break
						}
						case "RunEvent": {
							str += `    RunEvent${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.event}${" ".repeat(keyLengths[i++] - animation.event.length + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "StopEvent": {
							str += `    StopEvent${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.event}${" ".repeat(keyLengths[i++] - animation.event.length + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "SetVisible": {
							str += `    SetVisible${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.element}${" ".repeat(keyLengths[i++] - animation.element.length + extraSpaces)}`
							str += `${animation.visible}${" ".repeat(keyLengths[i++] - animation.visible.toString().length + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "FireCommand": {
							str += `    FireCommand${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.delay}${" ".repeat(keyLengths[i++] - animation.delay.toString().length + extraSpaces)}`
							str += `${/\s/.test(animation.command) ? `"${animation.command}"` : animation.command}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.command)
							str += `${newLine}`
							break
						}
						case "RunEventChild": {
							str += `    RunEventChild${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.element}${" ".repeat(keyLengths[i++] - animation.element.length + extraSpaces)}`
							str += `${animation.event}${" ".repeat(keyLengths[i++] - animation.event.length + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "SetInputEnabled": {
							str += `    SetInputEnabled${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.element}${" ".repeat(keyLengths[i++] - animation.element.length + extraSpaces)}`
							str += `${animation.visible}${" ".repeat(keyLengths[i++] - 1 + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "PlaySound": {
							str += `    PlaySound${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.delay}${" ".repeat(keyLengths[i++] - animation.delay.toString().length + extraSpaces)}`
							str += `${animation.sound}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
						case "StopPanelAnimations": {
							str += `    StopPanelAnimations${" ".repeat(keyLengths[i++] - animation.type.length + extraSpaces)}`
							str += `${animation.element}${" ".repeat(keyLengths[i++] - animation.element.length + extraSpaces)}`
							str += `${animation.delay}`
							writeOSTagAndOrComment(animation, keyLengths, i, animation.delay.toString())
							str += `${newLine}`
							break
						}
					}
				}
				else {
					str += `    ${writeComment(animation.comment)}${newLine}`
				}
			}
			str += `}${newLine}`
		}
	}
	return str
}
