import"./style-oCQ6kVtL.js";const p=[{id:"fourier",title:"Fourier Series",description:"Visualize a relation between periodic functions and its Fourier coefficients.",tags:["Analysis"],path:"concepts/fourier/"},{id:"group-rep",title:"Finite Group Representations",description:"Visualize real irreducible representations of small groups. Compose group elements from generators and explore how they act on vector spaces.",tags:["Representation Theory"],path:"concepts/group-rep/"},{id:"bezout",title:"Bézout's Theorem",description:"Two algebraic curves of degrees d₁ and d₂ meet in exactly d₁·d₂ points in ℝP², counted over ℂ. Visualize real and complex intersections.",tags:["Algebraic Geometry"],path:"concepts/bezout/"}],u=document.getElementById("grid");p.forEach((e,c)=>{const i=c===0,d=i?"bento-card--featured":"bento-card--secondary",t=document.createElement("a");t.className=`bento-card glass-panel ${d}`,t.href=e.path;const a=document.createElement("canvas");a.width=560,a.height=i?180:120;const s=document.createElement("div");s.className="bento-card__header",s.innerHTML=`
    <span class="bento-tag">${e.tags[0]??""}</span>
    <h2 class="bento-card__title">${e.title}</h2>
  `;const n=document.createElement("div");n.className="bento-card__thumb",n.appendChild(a);const o=document.createElement("p");o.className="bento-card__desc",o.textContent=e.description;const r=document.createElement("div");r.className="bento-card__footer",r.innerHTML=`
    <div class="bento-card__tags">
      ${e.tags.map(l=>`<span class="tag">${l}</span>`).join("")}
    </div>
    <span class="btn-launch">Launch →</span>
  `,t.append(s,n,o,r),u.appendChild(t),e.thumbnail&&e.thumbnail(a)});
