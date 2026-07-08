interface Props {
  searchParams: Promise<{ type?: string }>
}

export default async function ErrorPage({ searchParams }: Props) {
  const { type } = await searchParams
  return (
    <>
      <p>Error: {type}</p>
      <p>Please contact reception.</p>
    </>
  )
}
