// GoKoreaMate / gokoreamate.com — Story Routes Types
// TASK-019: Story Routes API + Legacy Cleanup

export interface RouteTemplateStayHint {
  place_id:     string;
  stay_minutes: number;
}

export type DurationType = "half_day" | "full_day";
export type Difficulty   = "easy" | "moderate" | "hard";

export interface RouteTemplate {
  route_id:         string;
  city:             string;           // "busan" | "seoul" | "jeju" | ...
  title_ko:         string;
  title_en:         string;
  description_ko:   string;
  description_en:   string;
  mood_tags:        string[];
  duration_type:    DurationType;
  estimated_minutes: number;
  difficulty:       Difficulty;
  route_type:       string;           // "kpop" | "food" | "cultural" | "scenic" | "nightview" | "temple"
  is_active:        boolean;
  stays:            RouteTemplateStayHint[];
}
