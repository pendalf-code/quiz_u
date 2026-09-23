/**
 * Quiz U - Math Formula Renderer
 * Поддержка отображения математических и физических формул LaTeX ($...$ и $$...$$)
 * Интеграция с KaTeX + надёжный встроенный Unicode/HTML fallback.
 */

(function (window) {
    'use strict';

    const GREEK_MAP = {
        '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
        '\\varepsilon': 'ε', '\\epsilon': 'ε', '\\zeta': 'ζ', '\\eta': 'η',
        '\\theta': 'θ', '\\iota': 'ι', '\\kappa': 'κ', '\\lambda': 'λ',
        '\\mu': 'μ', '\\nu': 'ν', '\\xi': 'ξ', '\\pi': 'π', '\\rho': 'ρ',
        '\\sigma': 'σ', '\\tau': 'τ', '\\upsilon': 'υ', '\\phi': 'ϕ',
        '\\chi': 'χ', '\\psi': 'ψ', '\\omega': 'ω',
        '\\Gamma': 'Γ', '\\Delta': 'Δ', '\\Theta': 'Θ', '\\Lambda': 'Λ',
        '\\Xi': 'Ξ', '\\Pi': 'Π', '\\Sigma': 'Σ', '\\Upsilon': 'Υ',
        '\\Phi': 'Φ', '\\Psi': 'Ψ', '\\Omega': 'Ω'
    };

    const MATH_SYMBOL_MAP = {
        '\\approx': '≈', '\\times': '×', '\\cdot': '·', '\\pm': '±', '\\mp': '∓',
        '\\le': '≤', '\\ge': '≥', '\\neq': '≠', '\\ne': '≠', '\\infty': '∞',
        '\\hbar': 'ℏ', '\\partial': '∂', '\\nabla': '∇', '\\in': '∈', '\\notin': '∉',
        '\\subset': '⊂', '\\cup': '∪', '\\cap': '∩', '\\forall': '∀', '\\exists': '∃',
        '\\sim': '∼', '\\propto': '∝', '\\equiv': '≡', '\\ll': '≪', '\\gg': '≫',
        '\\to': '→', '\\leftarrow': '←', '\\rightarrow': '→', '\\Rightarrow': '⇒',
        '\\langle': '⟨', '\\rangle': '⟩', '\\ell': 'ℓ'
    };

    const HAT_MAP = {
        'H': 'Ĥ', 'x': 'x̂', 'p': 'p̂', 'y': 'ŷ', 'z': 'ẑ',
        'A': 'Â', 'B': 'B̂', 'C': 'Ĉ', 'E': 'Ê', 'G': 'Ĝ',
        'I': 'Î', 'J': 'Ĵ', 'O': 'Ô', 'S': 'Ŝ', 'U': 'Û',
        'W': 'Ŵ', 'Y': 'Ŷ', 'a': 'â', 'c': 'ĉ', 'e': 'ê',
        'g': 'ĝ', 'i': 'î', 'j': 'ĵ', 'o': 'ô', 's': 'ŝ',
        'u': 'û', 'w': 'ŵ', 'y': 'ŷ'
    };

    function escapeHtmlSafe(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatMathUnicodeFallback(tex) {
        let res = tex;

        // Нормализация возможных скрытых control-символов из unescaped JSON
        res = res.replace(/\t/g, '\\theta');
        res = res.replace(/\x08/g, '\\beta');

        // Квантовые операторы с крышкой: \hat{H} -> Ĥ, \hat{x} -> x̂, \hat{p} -> p̂
        res = res.replace(/\\hat\{([a-zA-Z])\}/g, (m, ch) => HAT_MAP[ch] || (ch + '̂'));
        res = res.replace(/\\hat([a-zA-Z])/g, (m, ch) => HAT_MAP[ch] || (ch + '̂'));

        // Текст внутри формул: \text{He} -> He
        res = res.replace(/\\text\{([^}]+)\}/g, '$1');

        // Корни n-й степени: \sqrt[n]{x} -> ⁿ√(x)
        res = res.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1√($2)');

        // Квадратные корни: \sqrt{\frac{...}{...}} или \sqrt{x}
        res = res.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');
        res = res.replace(/\\sqrt([a-zA-Z0-9])/g, '√$1');

        // Дроби: \frac{a}{b} -> (a / b)
        // Вложенные дроби обрабатываем циклами
        while (/\\frac\{([^}]+)\}\{([^}]+)\}/.test(res)) {
            res = res.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1 / $2)');
        }

        // Греческие буквы
        for (const [cmd, sym] of Object.entries(GREEK_MAP)) {
            res = res.split(cmd).join(sym);
        }

        // Математические символы
        for (const [cmd, sym] of Object.entries(MATH_SYMBOL_MAP)) {
            res = res.split(cmd).join(sym);
        }

        // Верхние индексы со сложными выражениями: ^{i\phi} -> <sup>iϕ</sup>, ^{-35} -> <sup>-35</sup>
        res = res.replace(/\^{([^}]+)}/g, '<sup>$1</sup>');
        res = res.replace(/\^([0-9a-zA-Z+-]+)/g, '<sup>$1</sup>');

        // Нижние индексы со сложными выражениями: _{\mu\nu} -> <sub>μν</sub>, _{n-1} -> <sub>n-1</sub>
        res = res.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
        res = res.replace(/_([0-9a-zA-Z+-]+)/g, '<sub>$1</sub>');

        // Стандартные математические функции
        res = res.replace(/\\(log|ln|exp|sin|cos|tan|cot|sec|csc|det|dim|ker|deg)\b/g, '$1');

        // Экранированный знак процента \% -> %
        res = res.replace(/\\%/g, '%');

        // Очистка оставшихся обратных слэшей
        res = res.replace(/\\/g, '');

        // Очистка лишних фигурных скобок внутри степеней/индексов
        res = res.replace(/<sup>\{([^}]+)\}<\/sup>/g, '<sup>$1</sup>');
        res = res.replace(/<sub>\{([^}]+)\}<\/sub>/g, '<sub>$1</sub>');

        const isLong = res.length > 25 || res.includes('=') || res.includes('<sup>') && res.includes('<sub>');
        const extraClass = isLong ? ' math-formula-prominent' : '';

        return `<span class="math-formula${extraClass}" title="Математическая формула">${res}</span>`;
    }

    function renderMathInString(text) {
        if (!text || typeof text !== 'string') return '';

        // Проверяем наличие формульных разделителей $
        if (!text.includes('$')) {
            return escapeHtmlSafe(text);
        }

        // 1. Блочные формулы: $$...$$
        let processed = text.replace(/\$\$([^$]+?)\$\$/g, function (match, formula) {
            if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
                try {
                    const rendered = window.katex.renderToString(formula, { displayMode: true, throwOnError: true });
                    return '<div class="math-formula-block katex-block-wrapper">' + rendered + '</div>';
                } catch (e) {
                    console.warn('KaTeX block error, fallback used:', e.message);
                }
            }
            return '<div class="math-formula-block">' + formatMathUnicodeFallback(formula) + '</div>';
        });

        // 2. Строчные (inline) формулы: $...$
        // Игнорируем одиночные доллары валюты (например "$4750" или "$16 000")
        processed = processed.replace(/\$([^$\n]+?)\$/g, function (match, formula) {
            if (typeof window !== 'undefined' && window.katex && typeof window.katex.renderToString === 'function') {
                try {
                    const rendered = window.katex.renderToString(formula, { displayMode: false, throwOnError: true });
                    return '<span class="math-katex-wrapper">' + rendered + '</span>';
                } catch (e) {
                    console.warn('KaTeX inline error, fallback used:', e.message);
                }
            }
            return formatMathUnicodeFallback(formula);
        });

        return processed;
    }

    // Экспорт в глобальное окружение
    window.renderMathInString = renderMathInString;
    window.formatMathUnicodeFallback = formatMathUnicodeFallback;
    window.escapeHtmlSafe = escapeHtmlSafe;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            renderMathInString,
            formatMathUnicodeFallback,
            escapeHtmlSafe
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
