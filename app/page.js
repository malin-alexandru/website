export default function HomePage() {
  return (
    <main className="scene" aria-label="Copac pe fundal de cer">
      <div className="cloud cloud--one" />
      <div className="cloud cloud--two" />
      <div className="cloud cloud--three" />
      <img
        className="tree"
        src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/20771654_x0w5_eydt_210607.svg`}
        alt="Copac"
      />
    </main>
  );
}
