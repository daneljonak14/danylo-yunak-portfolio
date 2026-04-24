# Motion Portfolio

Simple English portfolio website for animation work with autoplay support for GIF, MP4, and MOV files.

## Files

- `index.html` - main public page for GitHub Pages and recruiter sharing
- `editor.html` - editor version for your own local management
- `portfolio.html` - extra view-only copy if you want a separate filename
- `published-projects.js` - published gallery items used by the shareable page
- `styles.css` - visual design and responsive layout
- `script.js` - editor logic, browser-saved uploads, and tag filtering
- `viewer.js` - read-only gallery logic
- `media/` - put your real portfolio files here

## How to use

1. Open `editor.html` when you want to edit locally.
2. Use the portfolio manager section to upload files, add a title, description, and tags.
3. Local uploads in the editor are saved in your browser on your computer and stay there after refresh.
4. For the version you send to recruiters, place your final files in `media/` and update `published-projects.js`.
5. Share `index.html` through GitHub Pages as the public site.

## Example published project item

```js
{
  title: "Launch Animation",
  description: "Brand motion system for a mobile product campaign.",
  type: "video",
  src: "./media/launch-animation.mp4",
  format: "MP4",
  tags: ["Brand Motion", "UI"],
  storage: "project",
}
```

For GIF use `type: "gif"`.

## Notes

- The gallery now keeps original proportions better, so square, portrait, and landscape files can sit together more naturally.
- Tags are filterable directly on the page.
- `editor.html` is your editor.
- `index.html` is now the GitHub Pages homepage.
- `portfolio.html` is your shareable view-only page.
- Browser-saved uploads are convenient for editing on your machine, but recruiter-safe permanent files should still live in the project folder and be listed in `published-projects.js`.

## GitHub Pages

1. Create a new GitHub repository.
2. Upload the whole project folder contents to that repository.
3. In GitHub, open `Settings -> Pages`.
4. Under build and deployment, choose `Deploy from a branch`.
5. Select the `main` branch and the `/ (root)` folder.
6. Save, then wait for GitHub to publish the site.

After that, your shareable link will use `index.html` automatically as the homepage.

## Important note about MOV

MOV playback depends on the browser and codec. If a recruiter has trouble opening a `.mov` file, export an `.mp4` version as well for the safest compatibility.
