import 'package:lendify/models/planner.dart';
import 'package:lendify/services/auth_service.dart';
import 'package:lendify/services/backend_repository.dart';

abstract class PlannerGateway {
  Future<PlannerCatalog> loadCatalog(AuthSessionOwner owner);

  Future<PlannerResolution> resolve({
    required AuthSessionOwner owner,
    required Map<String, dynamic> request,
  });

  Future<PlannerCartReceipt> addToCart({
    required AuthSessionOwner owner,
    required String projectId,
    required Map<String, dynamic> request,
    required PlannerResolution resolution,
    required String variantId,
  });
}

class BackendPlannerGateway implements PlannerGateway {
  const BackendPlannerGateway();

  @override
  Future<PlannerCatalog> loadCatalog(AuthSessionOwner owner) async {
    final response =
        await BackendRepository.getPlannerTemplateCatalogForOwner(owner);
    return PlannerCatalog.fromJson(response);
  }

  @override
  Future<PlannerResolution> resolve({
    required AuthSessionOwner owner,
    required Map<String, dynamic> request,
  }) async {
    final response = await BackendRepository.resolvePlannerForOwner(
      owner: owner,
      request: request,
    );
    return PlannerResolution.fromJson(response);
  }

  @override
  Future<PlannerCartReceipt> addToCart({
    required AuthSessionOwner owner,
    required String projectId,
    required Map<String, dynamic> request,
    required PlannerResolution resolution,
    required String variantId,
  }) async {
    final response = await BackendRepository.addPlannerProjectToCartForOwner(
      owner: owner,
      projectId: projectId,
      request: request,
    );
    return PlannerCartReceipt.fromJson(
      response,
      resolution: resolution,
      variantId: variantId,
    );
  }
}
