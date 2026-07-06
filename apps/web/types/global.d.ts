// Allow CSS module imports (Next.js handles these at build time)
declare module '*.css' {
  const styles: Record<string, string>
  export default styles
}
