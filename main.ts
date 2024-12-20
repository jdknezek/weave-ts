#!/usr/bin/env node

import * as ts from 'typescript';
import * as consumers from 'node:stream/consumers';

const input = await consumers.text(process.stdin);

const scanner = ts.createScanner(ts.ScriptTarget.ESNext, false);
scanner.setText(input);

let state: 'unknown' | 'code' | 'comment' = 'unknown';
let buffer: string[] = [];

let firstPrint = true;
function printBuffer () {
	if (!buffer.length) return;

	if (firstPrint) {
		firstPrint = false;
	} else {
		console.log();
	}

	switch (state) {
		case 'comment':
			console.log(buffer.join('\n').trim());
			break;
		case 'code':
			console.log('```typescript');
			console.log(buffer.join('').replace(/^(\r|\n)+/, '').trimEnd());
			console.log('```');
			break;
	}

	buffer.splice(0, buffer.length);
}

file:
while (true) {
	const token = scanner.scan();
	// console.log('token: %s %o', ts.SyntaxKind[syntaxKind], scanner.getTokenText());

	switch (token) {
		case ts.SyntaxKind.EndOfFileToken:
			break file;
		case ts.SyntaxKind.MultiLineCommentTrivia:
			if (state !== 'comment') {
				printBuffer();
				state = 'comment';
			}

			for (const line of scanner.getTokenText().split(/\r\n|\r|\n/g)) {
				buffer.push(line.replace(/^\s*\/?\*+\/?\s*/, ''));
			}
			break;
		case ts.SyntaxKind.TemplateHead:
			if (state !== 'code') {
				printBuffer();
				state = 'code';
			}

			// Consume an entire template literal, based on https://github.com/microsoft/TypeScript/blob/main/src/services/preProcess.ts#L363-L397
			const start = scanner.getTokenStart();
			let end = scanner.getTokenEnd();
			let braceDepth = 1; // TemplateHead includes the open brace

			template:
			while (true) {
				const token = scanner.scan();
				// console.log('token:', ts.SyntaxKind[token], scanner.getTokenEnd());
				switch (token) {
					case ts.SyntaxKind.EndOfFileToken:
						break template;
					case ts.SyntaxKind.TemplateHead:
						end = scanner.getTokenEnd();
						braceDepth++;
						break;
					case ts.SyntaxKind.CloseBraceToken:
						end = scanner.getTokenEnd();
						braceDepth--;
						if (braceDepth === 0) {
							// This may actually be the end of a template string
							const rescanned = scanner.reScanTemplateToken(false);
							// console.log('rescanned:', rescanned, ts.SyntaxKind[rescanned], scanner.getTokenText());
							end = scanner.getTokenEnd();
							switch (rescanned) {
								case ts.SyntaxKind.TemplateMiddle:
									braceDepth++;
									break;
								case ts.SyntaxKind.TemplateTail:
									break template;
							}
						}
						break;
					default:
						end = scanner.getTokenEnd();
						break;
				}
			}

			buffer.push(input.slice(start, end));
			break;
		default:
			if (state !== 'code') {
				printBuffer();
				state = 'code';
			}

			buffer.push(scanner.getTokenText());
			break;
	}
}

printBuffer();
