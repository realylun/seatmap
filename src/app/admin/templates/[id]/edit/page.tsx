import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EditorShell } from "@/features/editor/EditorShell";
import { publishVersionAction } from "@/server/actions/templates";
import { getTemplate, listTemplateVersions } from "@/server/queries/templates";
import {
  Loading,
  PageHeader,
  Table,
  Td,
  btnCls,
  formatDateTime,
} from "../../../_components/ui";

type IdParams = { params: Promise<{ id: string }> };

async function TemplateEditor({ params }: IdParams) {
  const { id } = await params;
  const [template, versions] = await Promise.all([
    getTemplate(id),
    listTemplateVersions(id),
  ]);
  if (!template) notFound();
  return (
    <>
      <PageHeader title={template.name}>
        <form action={publishVersionAction.bind(null, id)}>
          <button className={btnCls}>Publish version</button>
        </form>
      </PageHeader>
      <div id="editor-root" className="mb-8">
        <EditorShell
          template={{
            id: template.id,
            name: template.name,
            editorState: template.editorState,
            backgroundImageUrl: template.backgroundImageUrl,
          }}
        />
      </div>
      <h2 className="mb-2 text-lg font-medium">Published versions</h2>
      <Table head={["Version", "Sections", "Seats", "Published", "Geometry"]}>
        {versions.map((v) => (
          <tr key={v.id}>
            <Td>v{v.version}</Td>
            <Td>{v.sectionCount}</Td>
            <Td>{v.seatCount}</Td>
            <Td>{formatDateTime(v.createdAt)}</Td>
            <Td>
              <a className="text-blue-600 hover:underline" href={v.geometryUrl}>
                JSON
              </a>
            </Td>
          </tr>
        ))}
      </Table>
    </>
  );
}

export default function TemplateEditPage(props: IdParams) {
  return (
    <Suspense fallback={<Loading />}>
      <TemplateEditor params={props.params} />
    </Suspense>
  );
}
