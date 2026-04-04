/** Type declarations for Python source file imports. */
declare module "*.py" {
  /** The raw string content of the Python source file. */
  const content: string;
  export default content;
}
