export function createSlider({ container, label, min, max, step = 1, value, format, onChange }) {
  const fmt = format || (v => v)
  const group = document.createElement('div')
  group.className = 'ctrl-group'

  const lbl = document.createElement('span')
  lbl.className = 'ctrl-label'
  lbl.textContent = label + ':'

  const input = document.createElement('input')
  input.type = 'range'
  input.min = min; input.max = max; input.step = step; input.value = value

  const display = document.createElement('span')
  display.className = 'ctrl-value'
  display.textContent = fmt(value)

  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    display.textContent = fmt(v)
    onChange(v)
  })

  group.append(lbl, input, display)
  container.appendChild(group)
  return {
    el: group,
    getValue: () => parseFloat(input.value),
    setValue: v => { input.value = v; display.textContent = fmt(v) },
  }
}

export function createSelect({ container, label, options, value, onChange }) {
  const group = document.createElement('div')
  group.className = 'ctrl-group'

  const lbl = document.createElement('span')
  lbl.className = 'ctrl-label'
  lbl.textContent = label + ':'

  const select = document.createElement('select')
  options.forEach(opt => {
    const el = document.createElement('option')
    el.value = opt.value
    el.textContent = opt.label
    if (opt.value === value) el.selected = true
    select.appendChild(el)
  })
  select.addEventListener('change', () => onChange(select.value))

  group.append(lbl, select)
  container.appendChild(group)
  return { el: group, getValue: () => select.value }
}

export function createButton({ container, label, onClick }) {
  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = label
  btn.addEventListener('click', onClick)
  container.appendChild(btn)
  return btn
}

export function addDivider(container) {
  const div = document.createElement('div')
  div.className = 'divider'
  container.appendChild(div)
}
