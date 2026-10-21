import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <Link to="/">Back to the overview</Link>
    </>
  );
}
