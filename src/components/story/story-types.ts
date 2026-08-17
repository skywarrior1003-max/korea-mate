// Public Memory Story 가 화면에 그리는 것들.
//
// 이 타입들은 **표현용**이다. 서버에서 이 모양으로 내려오는 경로는 아직 없다 —
// 공개 Memory egress 는 따로 만들어야 하고(후속 보안 TASK), 그 전까지 이
// 컴포넌트들은 순수하게 props 만 받는다. 그래서 여기에 좌표·device_id·
// sourceKey 같은 것은 애초에 자리가 없다. 공개하면 안 되는 값은 타입에
// 없으니 실수로 내려보낼 수도 없다.

/** Journal 안의 사진 한 장 */
export interface StoryPhoto {
  /** 서명 URL 또는 로컬 미리보기. 저장 경로 원문이 아니다. */
  url: string;
  /** 대체 텍스트. 없으면 장소명을 쓴다. */
  alt?: string;
}

/** Memory 하나 = trip_moments 한 행. 사진 수만큼 늘어나지 않는다. */
export interface StoryMemory {
  id: string;
  /** 사용자가 적은 문구 그대로. 여기서 만들어 내거나 다듬지 않는다. */
  memo: string;
  /** 화면에 보이는 장소 이름. 좌표·주소·지도 링크는 받지 않는다. */
  placeName?: string;
  photos: StoryPhoto[];
}

/** 하루 */
export interface StoryDay {
  /** 1부터 */
  dayNumber: number;
  /** 이미 사람이 읽을 수 있게 만들어진 문자열. 만드는 쪽이 로케일을 정한다. */
  dateLabel: string;
  memories: StoryMemory[];
}

/** Cover */
export interface StoryCoverData {
  /** 대표 사진 */
  imageUrl: string;
  /** 날짜와 도시를 한 줄로. 만드는 쪽이 조립한다. */
  eyebrow: string;
  title: string;
  /** 작성자 표시 이름. 없으면 작성자 줄을 그리지 않는다. */
  authorName?: string;
  authorAvatarUrl?: string;
}

/** Summary */
export interface StorySummaryData {
  title: string;
  /** 일수와 장소 수를 한 줄로. */
  stats: string;
  description: string;
}

export interface PublicMemoryStory {
  cover: StoryCoverData;
  days: StoryDay[];
  summary: StorySummaryData;
}
