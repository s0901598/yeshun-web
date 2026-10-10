// 官網讀取資料的唯一入口。之後改接 Supabase 時，只需要改這個檔案。
// 規則：只回傳已發布（published）的案例與照片。
import { projects, type Project } from '../data/projects';

function onlyPublished(project: Project): Project {
  return {
    ...project,
    stages: [...project.stages]
      .sort((a, b) => a.sort - b.sort)
      .map((stage) => ({
        ...stage,
        photos: stage.photos.filter((ph) => ph.published).sort((a, b) => a.sort - b.sort),
      })),
  };
}

export async function getProjects(): Promise<Project[]> {
  return projects
    .filter((pj) => pj.published)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(onlyPublished);
}

export async function getFeaturedProjects(limit = 4): Promise<Project[]> {
  return (await getProjects()).filter((pj) => pj.featured).slice(0, limit);
}

export async function getProject(slug: string): Promise<Project | undefined> {
  return (await getProjects()).find((pj) => pj.slug === slug);
}
