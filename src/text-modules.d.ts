// Markdown imported `with { type: "text" }` is a string: Bun and esbuild inline the file's text.
declare module "*.md" {
  const text: string;
  export default text;
}
