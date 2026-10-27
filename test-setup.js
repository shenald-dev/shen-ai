const { Module } = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function(path) {
    if (path === 'vscode') {
        return {
            window: {
                createOutputChannel: () => ({
                    appendLine: () => {},
                    show: () => {},
                    dispose: () => {}
                })
            }
        };
    }
    return originalRequire.apply(this, arguments);
};
