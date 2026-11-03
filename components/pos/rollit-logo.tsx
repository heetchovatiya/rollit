export function RollitLogo({alt}: {alt: string}) {
  return <>
    <svg className="rollit-logo-filters" aria-hidden="true" width="0" height="0">
      <defs>
        <filter id="rollit-logo-paper" colorInterpolationFilters="sRGB">
          {/* Remove the sampled cream paper, including where the logo sits in an isolated panel. */}
          <feColorMatrix type="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 -15 0 0 13.95"/>
        </filter>
        <filter id="rollit-logo-dark" colorInterpolationFilters="sRGB">
          {/* Clear the cream paper and lift the remaining ink for contrast on dark surfaces. */}
          <feColorMatrix type="matrix" values="
            .65 0 0 0 .35
            0 .65 0 0 .35
            0 0 .65 0 .35
            0 -15 0 0 13.95"/>
        </filter>
      </defs>
    </svg>
    <img className="rollit-logo" src="/rollit-logo.jpg" alt={alt}/>
  </>;
}
