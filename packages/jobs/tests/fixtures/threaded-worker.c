#include <pthread.h>
#include <stdio.h>
#include <unistd.h>

static const char *marker;
static void *worker(void *unused) {
  (void)unused;
  usleep(1500000);
  FILE *file = fopen(marker, "w");
  if (file) { fputs("worker done\n", file); fclose(file); }
  return NULL;
}
int main(int argc, char **argv) {
  if (argc != 2) return 2;
  marker = argv[1];
  pthread_t thread;
  if (pthread_create(&thread, NULL, worker, NULL) != 0) return 1;
  pthread_detach(thread);
  pthread_exit(NULL);
}
