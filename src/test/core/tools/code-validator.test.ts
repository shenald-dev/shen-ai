import { expect } from "chai";
import { CodeValidator } from "../../../core/tools/code-validator";

describe("CodeValidator", () => {
    let validator: CodeValidator;

    beforeEach(() => {
        validator = new CodeValidator();
    });

    describe("validateCode", () => {
        it("should pass valid code without issues", () => {
            const code = `
                const a = 1;
                function test() {
                    return a;
                }
                const obj = { b: 2 };
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.true;
            expect(result.errorCount).to.equal(0);
        });

        it("should detect unbalanced brackets", () => {
            const code = `
                function test() {
                    if (true) {
                        console.log("hello");
                    // missing closing brace
                }
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.false;
            expect(result.errorCount).to.be.greaterThan(0);

            const bracketErrors = result.issues.filter(i => i.rule === "balanced-brackets");
            expect(bracketErrors.length).to.be.greaterThan(0);
        });

        it("should detect unexpected closing brackets", () => {
            const code = `
                function test() {
                    console.log("hello");
                }}
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.false;
            const bracketErrors = result.issues.filter(i => i.rule === "balanced-brackets");
            expect(bracketErrors.length).to.be.greaterThan(0);
            expect(bracketErrors[0].message).to.include("Unexpected closing bracket");
        });

        it("should detect mismatched brackets", () => {
            const code = `
                function test() [
                    console.log("hello");
                }
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.false;
            const bracketErrors = result.issues.filter(i => i.rule === "balanced-brackets");
            expect(bracketErrors.length).to.be.greaterThan(0);
            expect(bracketErrors[0].message).to.include("Mismatched bracket");
        });

        it("should handle brackets inside strings and comments", () => {
            const code = `
                // This { should not be checked
                /* This [ should not be checked */
                const str1 = "this } should not be checked";
                const str2 = 'this ] should not be checked';
                const str3 = \`this ) should not be checked\`;
                function test() { return true; }
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.true;
            expect(result.issues.filter(i => i.rule === "balanced-brackets").length).to.equal(0);
        });

        it("should detect unclosed strings", () => {
            const code = `
                const str = "unclosed string;
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.false;
            const stringErrors = result.issues.filter(i => i.rule === "unclosed-string");
            expect(stringErrors.length).to.be.greaterThan(0);
        });

        it("should emit warnings for missing semicolons", () => {
            const code = `
                const a = 1
                let b = 2
            `;
            const result = validator.validateCode(code, "test.ts");

            // Still valid (it's just a warning)
            expect(result.isValid).to.be.true;
            const semiWarnings = result.issues.filter(i => i.rule === "missing-semicolon");
            expect(semiWarnings.length).to.be.greaterThan(0);
        });

        it("should emit warnings for double semicolons", () => {
            const code = `
                const a = 1;;
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.true;
            const doubleSemiWarnings = result.issues.filter(i => i.rule === "double-semicolon");
            expect(doubleSemiWarnings.length).to.be.greaterThan(0);
        });

        it("should detect duplicate variable declarations", () => {
            const code = `
                const myVar = 1;
                let myVar = 2;
            `;
            const result = validator.validateCode(code, "test.ts");

            // It's a warning in the current implementation
            const duplicateWarnings = result.issues.filter(i => i.rule === "duplicate-declaration");
            expect(duplicateWarnings.length).to.be.greaterThan(0);
        });

        it("should validate basic JavaScript syntax errors using vm module", () => {
            const code = `
                const function = invalid; // syntax error
            `;
            const result = validator.validateCode(code, "test.js");

            expect(result.isValid).to.be.false;
            const syntaxErrors = result.issues.filter(i => i.rule === "syntax-error");
            expect(syntaxErrors.length).to.be.greaterThan(0);
        });

        it("should strip TypeScript types before validating javascript syntax", () => {
            const code = `
                interface MyInterface { val: string; }
                type MyType = string;
                function test(a: string, b: number[]): boolean {
                    return true;
                }
            `;
            const result = validator.validateCode(code, "test.ts");

            expect(result.isValid).to.be.true;
            const syntaxErrors = result.issues.filter(i => i.rule === "syntax-error");
            expect(syntaxErrors.length).to.equal(0);
        });
    });

    describe("validateImports", () => {
        it("should detect non-existent local imports", () => {
            const code = `
                import { Something } from "./my-module";
                import { External } from "react";
            `;

            // Mock fileExists to say "./my-module" doesn't exist
            const fileExists = (path: string) => path !== "./my-module";

            const issues = validator.validateImports(code, "test.ts", fileExists);

            expect(issues.length).to.equal(1);
            expect(issues[0].rule).to.equal("import-exists");
            expect(issues[0].message).to.include("'./my-module'");
        });

        it("should ignore external imports", () => {
            const code = `
                import React from "react";
                import * as path from "path";
            `;

            // Mock fileExists to say nothing exists locally
            const fileExists = () => false;

            const issues = validator.validateImports(code, "test.ts", fileExists);

            expect(issues.length).to.equal(0);
        });
    });
});
