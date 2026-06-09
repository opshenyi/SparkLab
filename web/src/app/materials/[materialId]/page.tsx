'use client';

import { useParams } from 'next/navigation';
import CourseMaterialViewerPageInner from '@/components/CourseMaterialViewerPageInner';

export default function MaterialViewerPage() {
  const params = useParams();
  const materialId = (params?.materialId ?? '') as string;
  return <CourseMaterialViewerPageInner materialId={materialId} />;
}
