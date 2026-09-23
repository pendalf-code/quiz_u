const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { renderMathInString, formatMathUnicodeFallback, escapeHtmlSafe } = require('../js/math_render.js');

describe('Math Formula Rendering & Pack Integrity Tests', () => {

  it('exports renderMathInString and helper functions', () => {
    assert.strictEqual(typeof renderMathInString, 'function');
    assert.strictEqual(typeof formatMathUnicodeFallback, 'function');
    assert.strictEqual(typeof escapeHtmlSafe, 'function');
  });

  it('renders Bloch sphere qubit state formula correctly without raw escape noise', () => {
    const input = 'Какой замкнутой единичной трехмерной сферой комплексных амплитуд состояний $|\\psi\\rangle = \\cos(\\theta/2)|0\\rangle + e^{i\\phi}\\sin(\\theta/2)|1\\rangle$ геометрически визуализируется состояние одного кубита?';
    const output = renderMathInString(input);

    assert.ok(output.includes('math-formula'), 'Should wrap formula in math-formula class');
    assert.ok(!output.includes('\\psi'), 'Must not contain raw \\psi');
    assert.ok(!output.includes('\\cos'), 'Must not contain raw \\cos');
    assert.ok(!output.includes('\\theta'), 'Must not contain raw \\theta');
    assert.ok(!output.includes('\\phi'), 'Must not contain raw \\phi');
    assert.ok(!output.includes('\\sin'), 'Must not contain raw \\sin');
    assert.ok(!output.includes('\\rangle'), 'Must not contain raw \\rangle');
    assert.ok(output.includes('ψ'), 'Must contain greek letter ψ');
    assert.ok(output.includes('θ'), 'Must contain greek letter θ');
    assert.ok(output.includes('ϕ'), 'Must contain greek letter ϕ');
    assert.ok(output.includes('|0⟩'), 'Must contain |0⟩ bra-ket state');
    assert.ok(output.includes('|1⟩'), 'Must contain |1⟩ bra-ket state');
    assert.ok(output.includes('<sup>iϕ</sup>'), 'Must format exponent as <sup>iϕ</sup>');
  });

  it('renders Greek letters and physical constants correctly in offline fallback', () => {
    const input = 'величина ($\\alpha \\approx 1/137$), равная $e^2 / (4\\pi\\varepsilon_0 \\hbar c)$';
    const output = renderMathInString(input);

    assert.ok(output.includes('α ≈ 1/137'), `Expected 'α ≈ 1/137', got: ${output}`);
    assert.ok(output.includes('π'), `Expected 'π', got: ${output}`);
    assert.ok(output.includes('ε'), `Expected 'ε', got: ${output}`);
    assert.ok(output.includes('ℏ'), `Expected 'ℏ', got: ${output}`);
    assert.ok(output.includes('<sup>2</sup>'), `Expected '<sup>2</sup>', got: ${output}`);
    assert.ok(output.includes('math-formula'), `Expected math-formula class, got: ${output}`);
  });

  it('renders square roots and fractions correctly in offline fallback', () => {
    const input = 'формулой $(1 + \\sqrt{5})/2$ для числа $\\phi$';
    const output = renderMathInString(input);

    assert.ok(output.includes('√(5)'), `Expected '√(5)', got: ${output}`);
    assert.ok(output.includes('ϕ'), `Expected 'ϕ', got: ${output}`);
  });

  it('renders quantum bra-ket states correctly', () => {
    const input = 'состоянием $|\\psi\\rangle = \\alpha|0\\rangle + \\beta|1\\rangle$';
    const output = renderMathInString(input);

    assert.ok(output.includes('|ψ⟩'), `Expected '|ψ⟩', got: ${output}`);
    assert.ok(output.includes('α|0⟩'), `Expected 'α|0⟩', got: ${output}`);
    assert.ok(output.includes('β|1⟩'), `Expected 'β|1⟩', got: ${output}`);
  });

  it('preserves plain currency values without trailing formulas', () => {
    const input1 = 'Винтовка за $4750 наносит большой урон';
    const output1 = renderMathInString(input1);
    assert.strictEqual(output1, 'Винтовка за $4750 наносит большой урон');

    const input2 = '$16 000';
    const output2 = renderMathInString(input2);
    assert.strictEqual(output2, '$16 000');
  });

  it('renders block equations ($$...$$) with math-formula-block container', () => {
    const input = '$$E = mc^2$$';
    const output = renderMathInString(input);
    assert.ok(output.includes('math-formula-block'), `Expected block container, got: ${output}`);
    assert.ok(output.includes('mc<sup>2</sup>'), `Expected mc<sup>2</sup>, got: ${output}`);
  });

  it('renders quantum operators with hat and tensor indices', () => {
    const input1 = '$i\\hbar \\frac{\\partial}{\\partial t} \\Psi = \\hat{H} \\Psi$';
    const output1 = renderMathInString(input1);
    assert.ok(output1.includes('Ĥ'), 'Should render Ĥ operator');
    assert.ok(output1.includes('Ψ'), 'Should render Ψ');
    assert.ok(output1.includes('∂'), 'Should render ∂');

    const input2 = '$G_{\\mu\\nu}$';
    const output2 = renderMathInString(input2);
    assert.ok(output2.includes('<sub>μν</sub>'), 'Should render <sub>μν</sub> tensor index');
  });

  it('verifies that packs 247, 252, and 378 have valid JSON and zero control character escapes in math', () => {
    const testFiles = [
      '05_Наука_и_Космос/247_Физика и законы Вселенной - Кванты, теория относительности, термодинамика.json',
      '05_Наука_и_Космос/252_Математика и IT - Алгоритмы, криптография, нейросети.json',
      '05_Наука_и_Космос/378_Квантовая физика и теория относительности.json'
    ];

    testFiles.forEach(relPath => {
      const fullPath = path.join(__dirname, '..', 'паки вопросов', relPath);
      assert.ok(fs.existsSync(fullPath), `File ${relPath} must exist`);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);
      const rounds = Array.isArray(data) ? data : (data.rounds || [data]);
      rounds.forEach(r => (r.themes || []).forEach(t => (t.questions || []).forEach(q => {
        ['q', 'a'].forEach(field => {
          const val = q[field];
          if (val && val.includes('$') && !/^\$\d+[\d\s]*$/.test(val.trim())) {
            assert.strictEqual(/[\t\x08\f\r]/.test(val), false, `Formula in ${relPath} (${field}) contains control characters: ${val}`);
            const rendered = renderMathInString(val);
            assert.strictEqual(/\\[a-zA-Z]+/.test(rendered), false, `Formula in ${relPath} has unrendered backslash: ${rendered}`);
          }
        });
      })));
    });
  });

  it('index.html contains KaTeX and math_render script references', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.ok(html.includes('katex.min.css'), 'index.html must reference katex.min.css');
    assert.ok(html.includes('katex.min.js'), 'index.html must reference katex.min.js');
    assert.ok(html.includes('js/math_render.js'), 'index.html must reference js/math_render.js');
  });

  it('css/style.css contains .math-formula, .math-formula-prominent and .katex styles', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
    assert.ok(css.includes('.math-formula'), 'css/style.css must define .math-formula');
    assert.ok(css.includes('.math-formula-prominent'), 'css/style.css must define .math-formula-prominent');
    assert.ok(css.includes('.katex'), 'css/style.css must define .katex');
  });
});
