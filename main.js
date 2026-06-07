import { concepts } from './registry.js'

const grid = document.getElementById('grid')

concepts.forEach((concept, i) => {
  const isFeatured = i === 0
  const sizeClass  = isFeatured ? 'bento-card--featured' : 'bento-card--secondary'

  const card = document.createElement('a')
  card.className = `bento-card glass-panel ${sizeClass}`
  card.href = concept.path

  const canvas = document.createElement('canvas')
  canvas.width  = 560
  canvas.height = isFeatured ? 180 : 120

  const header = document.createElement('div')
  header.className = 'bento-card__header'
  header.innerHTML = `
    <span class="bento-tag">${concept.tags[0] ?? ''}</span>
    <h2 class="bento-card__title">${concept.title}</h2>
  `

  const thumb = document.createElement('div')
  thumb.className = 'bento-card__thumb'
  thumb.appendChild(canvas)

  const desc = document.createElement('p')
  desc.className = 'bento-card__desc'
  desc.textContent = concept.description

  const footer = document.createElement('div')
  footer.className = 'bento-card__footer'
  footer.innerHTML = `
    <div class="bento-card__tags">
      ${concept.tags.map(t => `<span class="tag">${t}</span>`).join('')}
    </div>
    <span class="btn-launch">Launch →</span>
  `

  card.append(header, thumb, desc, footer)
  grid.appendChild(card)

  if (concept.thumbnail) concept.thumbnail(canvas)
})
