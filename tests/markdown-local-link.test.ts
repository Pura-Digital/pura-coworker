import { describe, it, expect } from 'vitest';
import {
  normalizeLocalFileMarkdownLinks,
  extractLocalFilePathFromHref,
  resolveLocalFilePathFromHref,
  looksLikeExternalWebHref,
  normalizeExternalWebHref,
} from '../src/renderer/utils/markdown-local-link';

describe('normalizeLocalFileMarkdownLinks', () => {
  it('normalizes absolute macOS path markdown links with spaces and newlines', () => {
    const input = [
      '已创建 Word 文档：',
      '[北京未来一个月天气介绍.docx](',
      '/Users/haoqing/Library/Application Support/open-cowork/default_working_dir/北京未来一个月天气介绍.docx',
      ')',
    ].join('\n');

    const output = normalizeLocalFileMarkdownLinks(input);

    expect(output).toContain('[北京未来一个月天气介绍.docx](file:///Users/haoqing/Library/Application%20Support/open-cowork/default_working_dir/%E5%8C%97%E4%BA%AC%E6%9C%AA%E6%9D%A5%E4%B8%80%E4%B8%AA%E6%9C%88%E5%A4%A9%E6%B0%94%E4%BB%8B%E7%BB%8D.docx)');
  });

  it('keeps web links unchanged', () => {
    const input = '[OpenAI](https://openai.com/docs)';
    expect(normalizeLocalFileMarkdownLinks(input)).toBe(input);
  });

  it('removes accidental line breaks inside local path href', () => {
    const input = '[文档](/Users/haoqing/Library/Application\n Support/open-cowork/default_working_dir/文档.docx)';
    const output = normalizeLocalFileMarkdownLinks(input);
    expect(output).toContain('file:///Users/haoqing/Library/Application%20Support/open-cowork/default_working_dir/%E6%96%87%E6%A1%A3.docx');
    expect(output).not.toContain('%0A');
  });
});

describe('extractLocalFilePathFromHref', () => {
  it('extracts decoded local path from file URL', () => {
    const href = 'file:///Users/haoqing/Library/Application%20Support/open-cowork/%E6%B5%8B%E8%AF%95.docx';
    expect(extractLocalFilePathFromHref(href)).toBe('/Users/haoqing/Library/Application Support/open-cowork/测试.docx');
  });

  it('extracts UNC paths from file URLs without dropping the host', () => {
    const href = 'file://server/share/%E6%B5%8B%E8%AF%95.docx';
    const result = extractLocalFilePathFromHref(href);
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\server\\share\\测试.docx');
    } else {
      expect(result).toBe('//server/share/测试.docx');
    }
  });

  it('returns null for external URLs', () => {
    expect(extractLocalFilePathFromHref('https://openai.com')).toBe(null);
    expect(extractLocalFilePathFromHref('mailto:test@example.com')).toBe(null);
  });
});

describe('looksLikeExternalWebHref', () => {
  it('detects bare and www web hosts', () => {
    expect(looksLikeExternalWebHref('https://openai.com')).toBe(true);
    expect(looksLikeExternalWebHref('www.example.com')).toBe(true);
    expect(looksLikeExternalWebHref('example.com/docs')).toBe(true);
    expect(looksLikeExternalWebHref('//cdn.example.com/assets')).toBe(true);
  });

  it('does not treat relative artifact paths as web links', () => {
    expect(looksLikeExternalWebHref('reports/summary.docx')).toBe(false);
    expect(looksLikeExternalWebHref('README.md')).toBe(false);
  });
});

describe('normalizeExternalWebHref', () => {
  it('adds https for bare and protocol-relative URLs', () => {
    expect(normalizeExternalWebHref('www.example.com')).toBe('https://www.example.com');
    expect(normalizeExternalWebHref('//example.com/path')).toBe('https://example.com/path');
    expect(normalizeExternalWebHref('https://openai.com')).toBe('https://openai.com');
  });
});

describe('resolveLocalFilePathFromHref', () => {
  it('does not resolve bare web hosts against cwd', () => {
    expect(
      resolveLocalFilePathFromHref('www.example.com', '/tmp/workspace')
    ).toBe(null);
    expect(
      resolveLocalFilePathFromHref('example.com/docs', '/tmp/workspace')
    ).toBe(null);
  });

  it('resolves relative artifact links using cwd', () => {
    const href = 'reports/北京未来一个月天气介绍.docx';
    expect(resolveLocalFilePathFromHref(href, '/Users/haoqing/Library/Application Support/open-cowork/default_working_dir'))
      .toBe('/Users/haoqing/Library/Application Support/open-cowork/default_working_dir/reports/北京未来一个月天气介绍.docx');
  });

  it('resolves /workspace links using cwd like artifact panel', () => {
    const href = '/workspace/reports/summary.docx';
    expect(resolveLocalFilePathFromHref(href, '/Users/haoqing/Library/Application Support/open-cowork/default_working_dir'))
      .toBe('/Users/haoqing/Library/Application Support/open-cowork/default_working_dir/reports/summary.docx');
  });

  it('normalizes line breaks before resolving local href', () => {
    const href = '/Users/haoqing/Library/Application\n Support/open-cowork/default_working_dir/文档.docx';
    expect(resolveLocalFilePathFromHref(href, null))
      .toBe('/Users/haoqing/Library/Application Support/open-cowork/default_working_dir/文档.docx');
  });

  it('keeps UNC paths intact after resolving file URLs', () => {
    const href = 'file://server/share/demo.txt';
    const result = resolveLocalFilePathFromHref(href, null);
    if (process.platform === 'win32') {
      expect(result).toBe('\\\\server\\share\\demo.txt');
    } else {
      expect(result).toBe('//server/share/demo.txt');
    }
  });
});
