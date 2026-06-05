import { concepts } from './registry.js'

const STRINGS = {
  ko: { title: '수학 시각화', subtitle: '개념을 직접 조작하며 탐구하세요.' },
  en: { title: 'Math Visualizations', subtitle: 'Explore concepts through direct interaction.' },
}

const grid       = document.getElementById('grid')
const langToggle = document.getElementById('lang-toggle')
const siteTitle  = document.getElementById('site-title')
const siteSub    = document.getElementById('site-subtitle')

let lang = localStorage.getItem('lang') || 'ko'

function t(concept, key) {
  if (lang === 'en' && concept.en?.[key]) return concept.en[key]
  return concept[key]
}

function renderCards() {
  grid.innerHTML = ''
  concepts.forEach(concept => {
    const card = document.createElement('a')
    card.className = 'concept-card'
    card.href = concept.path

    const canvas = document.createElement('canvas')
    canvas.width = 560
    canvas.height = 320

    const body = document.createElement('div')
    body.className = 'concept-card-body'
    body.innerHTML = `
      <h2>${t(concept, 'title')}</h2>
      <p>${t(concept, 'description')}</p>
      <div class="concept-card-tags">
        ${t(concept, 'tags').map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>
    `

    card.append(canvas, body)
    grid.appendChild(card)

    if (concept.thumbnail) concept.thumbnail(canvas)
  })
}

function applyLang() {
  const s = STRINGS[lang]
  siteTitle.textContent = s.title
  siteSub.textContent   = s.subtitle
  langToggle.textContent = lang === 'ko' ? 'EN' : '한국어'
  document.documentElement.lang = lang
  renderCards()
}

langToggle.addEventListener('click', () => {
  lang = lang === 'ko' ? 'en' : 'ko'
  localStorage.setItem('lang', lang)
  applyLang()
})

applyLang()
