// SVG Example: Breadcrumbs and Path Bar
const SvgBreadcrumbsExample = () => (
  <SvgUiElement width={450} height={40}>
    <rect
      x="5"
      y="5"
      width="440"
      height="30"
      rx="4"
      className="svg-header-bg"
    />
    <text x="15" y="25" className="svg-text">
      / <tspan className="svg-text-light">...</tspan> /projects/{" "}
      <tspan className="svg-text-light">...</tspan>{" "}
      /main_project/src/components/
    </text>
  </SvgUiElement>
);

export default SvgBreadcrumbsExample;
