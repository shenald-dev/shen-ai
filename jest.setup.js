jest.mock('vscode', () => {
  return {
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
  };
}, { virtual: true });
