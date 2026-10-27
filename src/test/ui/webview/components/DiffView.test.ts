import { computeDiff } from '../../../../ui/webview/components/DiffView';

describe('computeDiff', () => {
    it('should handle identical files', () => {
        const original = 'line1\nline2\nline3';
        const updated = 'line1\nline2\nline3';
        const result = computeDiff(original, updated, 'test.txt');

        expect(result.path).toBe('test.txt');
        expect(result.changes).toHaveLength(3);
        expect(result.changes.every(c => c.type === 'unchanged')).toBe(true);
    });

    it('should handle completely new files (all additions)', () => {
        const original = '';
        const updated = 'line1\nline2';
        const result = computeDiff(original, updated, 'test.txt');

        expect(result.changes).toHaveLength(3);
        expect(result.changes[0]).toEqual({ type: 'remove', lineNumber: 1, content: '' });
        expect(result.changes[1]).toEqual({ type: 'add', lineNumber: 2, content: 'line1' });
        expect(result.changes[2]).toEqual({ type: 'add', lineNumber: 3, content: 'line2' });
    });

    it('should handle completely removed files (all removals)', () => {
        const original = 'line1\nline2';
        const updated = '';
        const result = computeDiff(original, updated, 'test.txt');

        expect(result.changes).toHaveLength(3);
        expect(result.changes[0]).toEqual({ type: 'remove', lineNumber: 1, content: 'line1' });
        expect(result.changes[1]).toEqual({ type: 'remove', lineNumber: 2, content: 'line2' });
        expect(result.changes[2]).toEqual({ type: 'add', lineNumber: 3, content: '' });
    });

    it('should handle mixed additions and removals', () => {
        const original = 'line1\nline2\nline3';
        const updated = 'line1\nnew_line\nline3';
        const result = computeDiff(original, updated, 'test.txt');

        expect(result.changes).toHaveLength(4);
        expect(result.changes[0]).toEqual({ type: 'unchanged', lineNumber: 1, content: 'line1' });
        expect(result.changes[1]).toEqual({ type: 'remove', lineNumber: 2, content: 'line2' });
        expect(result.changes[2]).toEqual({ type: 'add', lineNumber: 3, content: 'new_line' });
        expect(result.changes[3]).toEqual({ type: 'unchanged', lineNumber: 4, content: 'line3' });
    });

    it('should assign sequential line numbers', () => {
        const original = 'a\nb';
        const updated = 'a\nc\nb';
        const result = computeDiff(original, updated, 'test.txt');

        expect(result.changes.map(c => c.lineNumber)).toEqual([1, 2, 3]);
    });
});
