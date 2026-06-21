# סקירת קוד - בונה זרימה

## מה האפליקציה עושה

האפליקציה היא עורך ויזואלי בעברית וב-RTL לבניית עץ החלטות. המשתמש יוצר שלבים, עורך טקסט לנציג, מוסיף אפשרויות תשובה, מחבר שלבים על הקנבס, ומייצא YAML שהסוכן יכול לקרוא. אין שמירה בדפדפן: כדי לשמור עבודה צריך לייצא YAML.

## מודל הנתונים הראשי

הטיפוסים המרכזיים נמצאים ב-`src/types/flow.ts`.

- `DecisionNode` הוא צומת React Flow שמייצג שלב בתסריט.
- `DecisionNodeData` הוא המידע העסקי של השלב: סוג שלב, טקסט, אפשרויות, תמונות, קישורים, עדכוני פרמטרים, פעולות וכלים.
- `DecisionEdge` הוא חיבור בין שלבים. החיבור קובע לאן ממשיכים בפועל.
- `ScenarioMetadata` הוא מידע כללי על התסריט כולו.

## מידע ויזואלי מול YAML

העורך שומר שני סוגי מידע:

- מידע עסקי שהסוכן צריך: `scenario`, `steps`, `options`, `next`, `images`, `links`, `parameterUpdates`, `actions`, `tools`.
- מידע פנימי של העורך: מיקומי צמתים, viewport וסגנון קווים.

המידע הפנימי נשמר תחת `_editor` ב-YAML. הסוכן אמור להתעלם ממנו; הוא מיועד רק לפתיחה חוזרת של התרשים באותו סידור ויזואלי.

## מה יש בתוך scenario

`scenario` כולל:

- `entryStepId`: שלב הפתיחה.
- `glassixKnowledgeItemName`: שם פריט במאגר הידע בגלסיקס.
- `searchoItemName`: שם הפריט בסרצ'ו.
- `searchoItemUrl`: קישור לפריט בסרצ'ו.
- `description`: תיאור כללי של התסריט.

## מה יש בתוך step

כל שלב ב-`steps` כולל:

- `id`: מזהה שלב, למשל `STEP-001`.
- `type`: סוג השלב: `question`, `choice`, `instruction`, `note`, או `end`.
- `script`: הטקסט לנציג.
- שדות אופציונליים: `images`, `links`, `parameterUpdates`, `actions`, `tools`.
- `options` או `next`, לפי מבנה ההמשך.
- `navigation`: רשימת שלבים קודמים ובאים לפי החיבורים בפועל.

## איך options ו-edges הופכים ל-next

במודל הוויזואלי, היעדים נשמרים כ-edges של React Flow.

- אם לשלב יש `options`, כל אפשרות משתמשת ב-handle משלה. החיבור מאותה אפשרות הופך ל-`option.next` ב-YAML.
- אם לשלב אין אפשרויות, החיבור הרגיל של השלב הופך ל-`step.next`.
- שלב מסוג `end` לא אמור לכלול חיבורים יוצאים.

הלוגיקה שמנרמלת ובודקת חיבורים נמצאת ב-`src/utils/flowHelpers.ts`.

## מה _editor עושה

`_editor` שומר מידע פנימי של העורך בלבד:

- `edgeStyle`: קווים זוויתיים או מעוקלים.
- `viewport`: מיקום וזום הקנבס.
- `positions`: מיקום כל שלב בקנבס.

בייבוא YAML, אם `_editor` קיים, העורך משחזר את המיקומים. אם הוא חסר, העורך מסדר את השלבים אוטומטית בעזרת `dagre`.

## איפה נמצא קוד ה-YAML

קוד ייבוא/ייצוא YAML נמצא ב-`src/utils/yaml.ts`.

הקובץ אחראי על:

- קריאת YAML והפיכתו לצמתים וחיבורים.
- ייצוא התרשים למבנה YAML.
- שמירת `_editor`.
- יצירת שם קובץ להורדה.

## איפה נמצאת הוולידציה

קוד הוולידציה נמצא ב-`src/utils/validation.ts`.

הוא בודק בין היתר:

- האם נבחר שלב פתיחה.
- האם שלב הפתיחה לא מקבל חיבורים נכנסים.
- האם לכל שלב יש טקסט.
- האם אפשרויות מחוברות ליעד.
- האם שלבי `end` לא מוציאים חיבורים.
- האם קיימים שלבים לא נגישים משלב הפתיחה.

## איפה נמצא UI של הצמתים

UI של צומת בקנבס נמצא ב-`src/components/nodes/DecisionTreeNode.tsx`.

שם נמצאים:

- תצוגת מזהה וסוג שלב.
- עריכת טקסט inline בלחיצה כפולה.
- עריכת תווית אפשרות inline.
- checkbox לבחירה מרובה.
- כפתורי מחיקה והוספת אפשרות.
- handles של React Flow לחיבורים.

UI של חיבור מחיק נמצא ב-`src/components/edges/DeletableDecisionEdge.tsx`.

## קבצים מרכזיים

- `src/App.tsx`: state ראשי, callbacks, React Flow וחיבור בין כל הקומפוננטות.
- `src/constants/flow.ts`: תוויות, קבועי handles, viewport ברירת מחדל וסוגי שלבים.
- `src/types/flow.ts`: טיפוסי TypeScript של המודל.
- `src/utils/flowHelpers.ts`: חוקי חיבור, יצירת edge, נרמול data של צמתים, IDs ועזרי קנבס.
- `src/components/sidebar/EditorSidebar.tsx`: פאנל הוספת שלבים ועריכת השלב הנבחר.
- `src/components/panels/Panels.tsx`: חלונות צד לפרטי תסריט, ייבוא, ולידציה וייצוא.

## מבנה תיקיות סופי

```text
src/
  App.tsx
  App.css
  main.tsx
  index.css
  components/
    canvas/CanvasOverlays.tsx
    edges/DeletableDecisionEdge.tsx
    nodes/DecisionTreeNode.tsx
    panels/Panels.tsx
    sidebar/EditorSidebar.tsx
    toolbar/TopToolbar.tsx
  constants/flow.ts
  types/flow.ts
  utils/
    flowHelpers.ts
    validation.ts
    yaml.ts
```

## הרצה מקומית

```bash
npm install
npm run dev
```

## build לפרודקשן

```bash
npm run build
```
