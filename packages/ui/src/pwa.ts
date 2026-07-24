export const registerPwa = () => {
  if (!("serviceWorker" in navigator)) return;

  const development = import.meta.env.DEV;
  void navigator.serviceWorker
    .register(development ? "/dev-sw.js?dev-sw" : "/sw.js", {
      type: development ? "module" : "classic",
    })
    .catch(console.error);
};
