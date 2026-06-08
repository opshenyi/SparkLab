import { redirect } from 'next/navigation';

/** 旧链接兼容：统一到 /materials/[id] */
export default function LegacyCourseMaterialRedirectPage({
  params,
}: {
  params: { mid: string };
}) {
  redirect(`/materials/${params.mid}`);
}
