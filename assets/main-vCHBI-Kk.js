import"./style-BkIEasoa.js";const s=[{id:"fourier",title:"Fourier Series",description:"Visualize a relation between periodic functions and its Fourier coefficients.",tags:["Analysis"],path:"concepts/fourier/"},{id:"group-rep",title:"Finite Group Representations",description:"Visualize real irreducible representations of small groups. Compose group elements from generators and explore how they act on vector spaces.",tags:["Representation Theory"],path:"concepts/group-rep/"}],n=document.getElementById("grid");s.forEach(e=>{const t=document.createElement("a");t.className="concept-card",t.href=e.path;const a=document.createElement("canvas");a.width=560,a.height=320;const i=document.createElement("div");i.className="concept-card-body",i.innerHTML=`
    <h2>${e.title}</h2>
    <p>${e.description}</p>
    <div class="concept-card-tags">
      ${e.tags.map(r=>`<span class="tag">${r}</span>`).join("")}
    </div>
  `,t.append(a,i),n.appendChild(t),e.thumbnail&&e.thumbnail(a)});
