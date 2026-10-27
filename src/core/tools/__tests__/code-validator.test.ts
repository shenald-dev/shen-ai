jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn().mockReturnValue({
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn()
        })
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn()
        })
    }
}), { virtual: true });

import { CodeValidator } from "../code-validator";

describe("CodeValidator", () => {
    let validator: CodeValidator;

    beforeEach(() => {
        validator = new CodeValidator();
    });

    describe("validateImports", () => {
        it("should return empty array for non TS/JS files", () => {
            const content = `import { useState } from 'react';\nimport axios from "axios";`;
            const fileExists = jest.fn().mockReturnValue(false);

            const issues = validator.validateImports(content, "test.css", fileExists);

            expect(issues).toEqual([]);
            expect(fileExists).not.toHaveBeenCalled();
        });

        it("should return empty array for valid non-relative imports", () => {
            const content = `import { useState } from 'react';\nimport axios from "axios";`;
            const fileExists = jest.fn().mockReturnValue(false); // Shouldn't be called for non-relative

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toEqual([]);
            expect(fileExists).not.toHaveBeenCalled();
        });

        it("should return empty array for valid relative imports that exist", () => {
            const content = `import { myFunc } from './myFunc';\nimport { other } from "../other";`;
            const fileExists = jest.fn().mockReturnValue(true);

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toEqual([]);
            expect(fileExists).toHaveBeenCalledTimes(2);
            expect(fileExists).toHaveBeenCalledWith("./myFunc");
            expect(fileExists).toHaveBeenCalledWith("../other");
        });

        it("should return issues for relative imports that do not exist", () => {
            const content = `import { myFunc } from './missingFunc';`;
            const fileExists = jest.fn().mockReturnValue(false);

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toHaveLength(1);
            expect(issues[0]).toEqual({
                line: 1,
                column: 25, // Index of './missingFunc' in the string + 1
                severity: "warning",
                message: "Import path './missingFunc' may not exist",
                rule: "import-exists"
            });
            expect(fileExists).toHaveBeenCalledTimes(1);
            expect(fileExists).toHaveBeenCalledWith("./missingFunc");
        });

        it("should handle absolute paths correctly", () => {
            const content = `import { data } from '/var/data';`;
            const fileExists = jest.fn().mockReturnValue(false);

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toHaveLength(1);
            expect(fileExists).toHaveBeenCalledWith("/var/data");
        });

        it("should handle mixed valid and invalid imports", () => {
            const content = `
import { A } from 'external-pkg';
import { B } from './exists';
import { C } from './missing';
            `.trim();

            const fileExists = jest.fn().mockImplementation((path) => path === './exists');

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toHaveLength(1);
            expect(issues[0].message).toBe("Import path './missing' may not exist");
            expect(issues[0].line).toBe(3);
        });

        it("should handle single quotes and double quotes", () => {
            const content = `import { A } from './missing1';\nimport { B } from "./missing2";`;
            const fileExists = jest.fn().mockReturnValue(false);

            const issues = validator.validateImports(content, "test.ts", fileExists);

            expect(issues).toHaveLength(2);
            expect(issues[0].message).toContain("./missing1");
            expect(issues[1].message).toContain("./missing2");
        });
    });
});
