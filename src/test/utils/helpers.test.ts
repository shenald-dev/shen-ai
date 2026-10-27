
import { safeJsonParse } from '../../utils/helpers';

describe('safeJsonParse', () => {
    it('should parse valid JSON correctly', () => {
        const jsonString = '{"key":"value"}';
        const fallback = { fallbackKey: 'fallbackValue' };
        const result = safeJsonParse(jsonString, fallback);
        expect(result).toEqual({ key: 'value' });
    });

    it('should return fallback for invalid JSON', () => {
        const invalidJsonString = '{invalid_json}';
        const fallback = { fallbackKey: 'fallbackValue' };
        const result = safeJsonParse(invalidJsonString, fallback);
        expect(result).toEqual(fallback);
    });

    it('should return fallback for empty string', () => {
        const emptyJsonString = '';
        const fallback = { fallbackKey: 'fallbackValue' };
        const result = safeJsonParse(emptyJsonString, fallback);
        expect(result).toEqual(fallback);
    });

    it('should handle array JSON correctly', () => {
        const jsonString = '[1, 2, 3]';
        const fallback = [] as number[];
        const result = safeJsonParse(jsonString, fallback);
        expect(result).toEqual([1, 2, 3]);
    });
});
