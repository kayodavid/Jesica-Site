(() => {
  const STORAGE_KEY = 'jessica-melo-site-language';
  const translations = {
    pt: {
      pageTitle: 'Nutricionista Jessica Melo',
      logoAlt: 'Jessica Melo Nutricionista',
      navHome: 'Início',
      navAbout: 'Quem sou eu',
      navBlog: 'Blog',
      navPatient: 'Área do Paciente',
      navSchedule: 'Agendar',
      languageLabel: 'Idioma',
      languagePt: 'Português',
      languageEn: 'English',
      menuOpen: 'Abrir menu',
      heroTitle: 'Atendimento nutricional <span class="text-dark">personalizado</span>, baseado em ciência e adaptado às suas necessidades individuais.',
      heroCta: 'AGENDAR ATENDIMENTO',
      purpose: 'O objetivo é orientar e apoiar em sua jornada, com escuta ativa, combinando nutrição, comportamento alimentar, rotina e autoconsciência para melhora dos desfechos de saúde.',
      freedomOne: 'Sem sofrer,',
      freedomTwo: 'Sem passar fome,',
      freedomThree: 'Comendo o que você gosta.',
      freedomCta: 'EU QUERO INVESTIR NA MINHA SAÚDE',
      seekTitle: 'Quando buscar atendimento nutricional?',
      seekOne: 'Baixa energia, fadiga constante ou dificuldade de concentração;',
      seekTwo: 'Para reduzir problemas emocionais, como estresse e ansiedade;',
      seekThree: 'Não saber o que comer, quanto comer e quando comer;',
      seekFour: 'Sensação de culpa ou obsessão com alimentação;',
      seekFive: 'Vive em um ciclo de engorda e emagrece infinito;',
      seekSix: 'Sofrimento com dietas restritivas.',
      faqTitle: 'Perguntas Frequentes',
      faqOneQuestion: '1. Já testei várias dietas e não funcionaram. O que muda aqui?',
      faqOneAnswer: 'O meu trabalho tem como base a mudança de comportamento, antes da mudança alimentar. Vou entender o porquê que você não consegue emagrecer ou alcançar seus objetivos e te direcionar em um caminho com mais clareza. Além disso, o atendimento é individualizado, levando em conta sua rotina, preferências e histórico de saúde, sempre baseado em evidências científicas.',
      faqTwoQuestion: '2. A consulta é só sobre dieta?',
      faqTwoAnswer: 'Não. O atendimento também gira em torno de hábitos de vida, relação com a comida, sinais de fome e saciedade, comportamento alimentar, além de estratégias práticas para o seu dia-a-dia.',
      faqThreeQuestion: '3. Vou ter que parar de comer tudo o que eu gosto?',
      faqThreeAnswer: 'Não. O objetivo não é tirar seus alimentos preferidos, mas sim cuidar da sua saúde nutricional encontrando um equilíbrio que funciona para você, dentro da sua rotina.',
      faqCta: 'AGENDAR CONSULTA',
      footer: '© 2026 Jessica Melo Nutricionista. Todos os direitos reservados.'
    },
    en: {
      pageTitle: 'Jessica Melo Nutritionist',
      logoAlt: 'Jessica Melo Nutritionist',
      navHome: 'Home',
      navAbout: 'About me',
      navBlog: 'Blog',
      navPatient: 'Patient Area',
      navSchedule: 'Book now',
      languageLabel: 'Language',
      languagePt: 'Português',
      languageEn: 'English',
      menuOpen: 'Open menu',
      heroTitle: 'Personalized <span class="text-dark">nutrition care</span>, grounded in science and tailored to your individual needs.',
      heroCta: 'BOOK AN APPOINTMENT',
      purpose: 'My goal is to guide and support you on your journey through active listening, combining nutrition, eating behavior, daily routine and self-awareness to improve your health outcomes.',
      freedomOne: 'Without suffering,',
      freedomTwo: 'Without going hungry,',
      freedomThree: 'Eating what you love.',
      freedomCta: 'I WANT TO INVEST IN MY HEALTH',
      seekTitle: 'When should you seek nutrition care?',
      seekOne: 'Low energy, constant fatigue or difficulty concentrating;',
      seekTwo: 'To reduce emotional challenges such as stress and anxiety;',
      seekThree: 'Not knowing what to eat, how much to eat or when to eat;',
      seekFour: 'Feelings of guilt or an obsession with food;',
      seekFive: 'Being stuck in an endless cycle of losing and regaining weight;',
      seekSix: 'Struggling with restrictive diets.',
      faqTitle: 'Frequently Asked Questions',
      faqOneQuestion: '1. I have tried several diets and they did not work. What is different here?',
      faqOneAnswer: 'My work is based on changing behavior before changing food choices. I will understand why you have not been able to lose weight or reach your goals and guide you toward a clearer path. Care is individualized, taking your routine, preferences and health history into account, always grounded in scientific evidence.',
      faqTwoQuestion: '2. Is the consultation only about diet?',
      faqTwoAnswer: 'No. Care also addresses lifestyle habits, your relationship with food, hunger and fullness cues, eating behavior and practical strategies for your everyday life.',
      faqThreeQuestion: '3. Will I have to stop eating everything I enjoy?',
      faqThreeAnswer: 'No. The goal is not to take away your favorite foods, but to care for your nutritional health by finding a balance that works for you and your routine.',
      faqCta: 'BOOK A CONSULTATION',
      footer: '© 2026 Jessica Melo Nutritionist. All rights reserved.'
    }
  };

  const getStoredLanguage = () => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pt';
    } catch {
      return 'pt';
    }
  };

  const applyLanguage = language => {
    const locale = language === 'en' ? 'en' : 'pt';
    const copy = translations[locale];
    document.documentElement.lang = locale === 'en' ? 'en' : 'pt-BR';
    document.title = copy.pageTitle;
    document.body.dataset.siteLanguage = locale;

    document.querySelectorAll('[data-i18n]').forEach(element => {
      const key = element.dataset.i18n;
      if (copy[key] !== undefined) element.textContent = copy[key];
    });
    document.querySelectorAll('[data-i18n-html]').forEach(element => {
      const key = element.dataset.i18nHtml;
      if (copy[key] !== undefined) element.innerHTML = copy[key];
    });
    document.querySelectorAll('[data-i18n-attr]').forEach(element => {
      const entries = element.dataset.i18nAttr.split('|');
      entries.forEach(entry => {
        const separator = entry.indexOf(':');
        if (separator < 1) return;
        const attribute = entry.slice(0, separator);
        const key = entry.slice(separator + 1);
        if (copy[key] !== undefined) element.setAttribute(attribute, copy[key]);
      });
    });
    document.querySelectorAll('[data-language-choice]').forEach(button => {
      const active = button.dataset.languageChoice === locale;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('bg-primary', active);
      button.classList.toggle('text-white', active);
      button.classList.toggle('shadow-sm', active);
      button.classList.toggle('text-gray-500', !active);
      button.classList.toggle('hover:text-dark', !active);
    });

    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // The page remains usable when storage is unavailable.
    }
  };

  const init = () => {
    document.querySelectorAll('[data-language-choice]').forEach(button => {
      button.addEventListener('click', () => applyLanguage(button.dataset.languageChoice));
    });
    applyLanguage(getStoredLanguage());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

export {}; 

// Keep this file compatible with Vite's static HTML entry points.
if (typeof module !== 'undefined') module.exports = {};
