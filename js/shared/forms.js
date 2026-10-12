/**
 * FreshMarket — Shared Produce Forms Definition & Normalizer (forms.js)
 * Single Source of Truth for Storefront, Buyer Admin, and Catalog
 */

(function () {
  const FORMS = [
    {
      id: 'whole',
      label: 'Целый',
      ru: 'Целый',
      en: 'Whole',
      ua: 'Цілий',
      km: 'ទាំងមូល',
      aliases: ['целый', 'цілий', 'whole', 'ទាំងមូល']
    },
    {
      id: 'root',
      label: 'Корень',
      ru: 'Корень',
      en: 'Root',
      ua: 'Корінь',
      km: 'មើម',
      aliases: ['корень', 'корінь', 'root', 'មើម']
    },
    {
      id: 'bunch',
      label: 'Пучок',
      ru: 'Пучок',
      en: 'Bunch',
      ua: 'Пучок',
      km: 'កញ្ចប់',
      aliases: ['пучок', 'bunch', 'កញ្ចប់', 'букет', 'связка']
    },
    {
      id: 'pods',
      label: 'Стручок',
      ru: 'Стручок',
      en: 'Pods',
      ua: 'Стручок',
      km: 'ផ្លែ',
      aliases: ['стручок', 'pods', 'ផ្លែ']
    },
    {
      id: 'sliced',
      label: 'Нарезка',
      ru: 'Нарезка',
      en: 'Sliced',
      ua: 'Нарізка',
      km: 'ចំណិត',
      aliases: ['нарезка', 'нарізка', 'sliced', 'ចំណិត', 'кубиками']
    },
    {
      id: 'fillet',
      label: 'Филе',
      ru: 'Филе',
      en: 'Fillet',
      ua: 'Філе',
      km: 'សាច់សុទ្ធ',
      aliases: ['филе', 'філе', 'fillet', 'សាច់សុទ្ធ']
    },
    {
      id: 'minced',
      label: 'Фарш',
      ru: 'Фарш',
      en: 'Minced',
      ua: 'Фарш',
      km: 'សាច់ចិញ្ច្រាំ',
      aliases: ['фарш', 'minced', 'សាច់ចិញ្ច្រាំ']
    },
    {
      id: 'peeled',
      label: 'Очищенный',
      ru: 'Очищенный',
      en: 'Peeled',
      ua: 'Очищений',
      km: 'បកសម្បក',
      aliases: ['очищенный', 'очищений', 'peeled', 'បកសម្បក']
    },
    {
      id: 'dried',
      label: 'Сушеный',
      ru: 'Сушеный',
      en: 'Dried',
      ua: 'Сушений',
      km: 'ក្រៀម',
      aliases: ['сушеный', 'сушений', 'dried', 'ក្រៀម']
    },
    {
      id: 'powder',
      label: 'Молотый',
      ru: 'Молотый',
      en: 'Powder',
      ua: 'Мелений',
      km: 'ម្សៅ',
      aliases: ['молотый', 'мелений', 'powder', 'ម្សៅ']
    },
    {
      id: 'paste',
      label: 'Паста',
      ru: 'Паста',
      en: 'Paste',
      ua: 'Паста',
      km: 'គ្រឿងបុក',
      aliases: ['паста', 'paste', 'គ្រឿងបុក']
    },
    {
      id: 'pickled',
      label: 'Маринованный',
      ru: 'Маринованный',
      en: 'Pickled',
      ua: 'Маринований',
      km: 'ជ្រក់',
      aliases: ['маринованный', 'маринований', 'pickled', 'ជ្រក់']
    },
    {
      id: 'frozen',
      label: 'Замороженный',
      ru: 'Замороженный',
      en: 'Frozen',
      ua: 'Заморожений',
      km: 'កក',
      aliases: ['замороженный', 'заморожений', 'frozen', 'កក']
    },
    {
      id: 'bottle',
      label: 'Бутылка',
      ru: 'Бутылка',
      en: 'Bottle',
      ua: 'Пляшка',
      km: 'ដប',
      aliases: ['бутылка', 'пляшка', 'bottle', 'ដប', 'соус', 'жидкий', 'liquid']
    }
  ];

  // Fast alias lookup map
  const ALIAS_MAP = {};
  FORMS.forEach((item) => {
    ALIAS_MAP[item.id.toLowerCase()] = item;
    if (Array.isArray(item.aliases)) {
      item.aliases.forEach((alias) => {
        ALIAS_MAP[alias.toLowerCase().trim()] = item;
      });
    }
  });

  /**
   * Normalizes any raw form string into structured form info
   * @param {string} form - Raw form string (e.g. "Соус", "Жидкий", "Целый")
   * @param {string} [lang] - Optional lang override ('ru', 'en', 'ua', 'km')
   * @returns {{ key: string|null, label: string, formObj: object|null }}
   */
  function normalizeFormInfo(form, lang) {
    if (!form || typeof form !== 'string') return null;
    const formTrim = form.trim();
    if (!formTrim) return null;
    const formNorm = formTrim.toLowerCase();

    const matched = ALIAS_MAP[formNorm] || null;
    if (!matched) {
      return { key: null, label: formTrim, formObj: null };
    }

    const key = matched.id;
    let label = matched.label;

    if (window.i18n && typeof window.i18n.t === 'function') {
      const trans = window.i18n.t(`forms.${key}`);
      if (trans && trans !== `forms.${key}`) {
        label = trans;
      }
    } else if (lang && matched[lang]) {
      label = matched[lang];
    }

    return { key, label, formObj: matched };
  }

  if (typeof window !== 'undefined') {
    window.FRESHMARKET_FORMS = FORMS;
    window.normalizeFormInfo = normalizeFormInfo;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FORMS, normalizeFormInfo };
  }
})();
