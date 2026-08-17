const DESTINATION = "https://keyring.app";

// Served as a real 200 so crawlers read the metadata from layout.tsx before the
// meta refresh moves an actual visitor along.
export default function Home() {
  return (
    <>
      <meta httpEquiv="refresh" content={`0; url=${DESTINATION}`} />
      <main>
        <p>
          Redirecting to <a href={DESTINATION}>keyring.app</a>…
        </p>
      </main>
    </>
  );
}
