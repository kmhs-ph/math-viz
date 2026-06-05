import { concepts } from './registry.js'

const grid = document.getElementById('grid')

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
    <h2>${concept.title}</h2>
    <p>${concept.description}</p>
    <div class="concept-card-tags">
      ${concept.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
    </div>
  `

  card.append(canvas, body)
  grid.appendChild(card)

  if (concept.thumbnail) concept.thumbnail(canvas)
})
